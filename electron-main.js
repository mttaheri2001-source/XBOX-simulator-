const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const http = require('http');
const server = require('./server');

let mainWindow;
let serverHandle;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#07131c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: opts.timeout || 5000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '', error: error?.message || null });
    });
  });
}

async function findFirst(candidates, args = []) {
  for (const c of candidates) {
    const r = await run(c, args);
    if (r.ok || r.stdout || r.stderr) return { command: c, result: r };
  }
  return { command: null, result: { ok: false, stdout: '', stderr: '' } };
}

function runtimePaths() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [];
  if (sdk) {
    candidates.push(path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'));
    candidates.push(path.join(sdk, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator'));
  }
  candidates.push(process.platform === 'win32' ? path.join(home, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe') : path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'));
  candidates.push(process.platform === 'win32' ? path.join(home, 'AppData', 'Local', 'Android', 'Sdk', 'emulator', 'emulator.exe') : path.join(home, 'Android', 'Sdk', 'emulator', 'emulator'));
  return [...new Set(candidates)];
}

async function getRuntimeStatus() {
  const paths = runtimePaths();
  const adb = paths.find(p => fs.existsSync(p) && /adb(\.exe)?$/.test(p));
  const emulator = paths.find(p => fs.existsSync(p) && /emulator(\.exe)?$/.test(p));
  const adbProbe = adb ? await run(adb, ['devices']) : await findFirst([process.platform === 'win32' ? 'adb.exe' : 'adb'], ['devices']);
  const emulatorProbe = emulator ? await run(emulator, ['-list-avds']) : await findFirst([process.platform === 'win32' ? 'emulator.exe' : 'emulator'], ['-list-avds']);
  const docker = await findFirst([process.platform === 'win32' ? 'docker.exe' : 'docker'], ['version']);
  const devices = (adbProbe.stdout || '').split(/\r?\n/).slice(1).map(x => x.trim()).filter(Boolean);
  const avds = (emulatorProbe.stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return {
    adbFound: Boolean(adbProbe.ok || adbProbe.stdout),
    adbCommand: adb || (adbProbe.ok ? 'adb' : null),
    emulatorFound: Boolean(emulatorProbe.ok || emulatorProbe.stdout),
    emulatorCommand: emulator || (emulatorProbe.ok ? 'emulator' : null),
    dockerFound: Boolean(docker.result.ok),
    devices,
    avds,
    platform: process.platform
  };
}

async function startAvd(avd) {
  if (!avd) throw new Error('No AVD selected. Create one with Android Studio Device Manager first.');
  const status = await getRuntimeStatus();
  const cmd = status.emulatorCommand;
  if (!cmd) throw new Error('Android Emulator was not found. Install the Android SDK Emulator and set ANDROID_HOME.');
  const child = spawn(cmd, ['-avd', avd, '-netdelay', 'none', '-netspeed', 'full'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return { ok: true, message: `Started AVD: ${avd}` };
}

async function connectRedroid(host = '127.0.0.1', port = 5555) {
  const status = await getRuntimeStatus();
  const cmd = status.adbCommand;
  if (!cmd) throw new Error('adb not found. Install Android platform-tools.');
  const target = `${host}:${port}`;
  const r = await run(cmd, ['connect', target], { timeout: 10000 });
  if (!r.ok) throw new Error(r.stderr || 'ADB connection failed');
  return { ok: true, message: r.stdout.trim() || `Connected to ${target}` };
}

async function selectAndInstallApk() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Android APK',
    properties: ['openFile'],
    filters: [{ name: 'Android package', extensions: ['apk'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const apk = result.filePaths[0];
  const downloadsDir = path.join(app.getPath('downloads'), 'XboxS-Simulator');
  fs.mkdirSync(downloadsDir, { recursive: true });
  const dest = path.join(downloadsDir, path.basename(apk));
  fs.copyFileSync(apk, dest);
  const status = await getRuntimeStatus();
  if (!status.adbCommand) return { copied: true, path: dest, installed: false, message: 'APK copied to simulator downloads; adb is not available.' };
  const install = await run(status.adbCommand, ['install', '-r', dest], { timeout: 120000 });
  return { copied: true, path: dest, installed: install.ok, message: install.ok ? 'APK installed on the connected Android runtime.' : (install.stderr || install.stdout) };
}

ipcMain.handle('runtime:status', async () => getRuntimeStatus());
ipcMain.handle('runtime:start', async (_e, avd) => startAvd(avd));
ipcMain.handle('runtime:redroid', async (_e, args) => connectRedroid(args?.host, args?.port));
ipcMain.handle('runtime:redroid:start', async () => {
  if (process.platform === 'win32') throw new Error('The included ReDroid container setup requires a Linux host/VM with Docker and Android container kernel support.');
  const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
  const r = await run(docker, ['compose','-f',path.join(__dirname,'docker-compose.redroid.yml'),'up','-d'], {timeout:120000});
  if(!r.ok) throw new Error(r.stderr || r.stdout || 'Docker container failed to start');
  return {ok:true,message:'Android container started. Connect ADB to 127.0.0.1:5555.'};
});
ipcMain.handle('runtime:redroid:stop', async () => {
  if (process.platform === 'win32') throw new Error('ReDroid container stop is available on Linux hosts.');
  const docker = 'docker';
  const r = await run(docker, ['compose','-f',path.join(__dirname,'docker-compose.redroid.yml'),'down'], {timeout:60000});
  if(!r.ok) throw new Error(r.stderr || r.stdout || 'Docker container failed to stop');
  return {ok:true,message:'Android container stopped.'};
});
ipcMain.handle('apk:install', async () => selectAndInstallApk());
ipcMain.handle('open:url', async (_e, url) => shell.openExternal(url));

app.whenReady().then(async () => {
  serverHandle = await server.start(0);
  createWindow(serverHandle.port);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(serverHandle.port); });
});

app.on('window-all-closed', () => {
  if (serverHandle) serverHandle.close();
  if (process.platform !== 'darwin') app.quit();
});
