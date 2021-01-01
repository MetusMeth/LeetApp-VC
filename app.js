const {app, BrowserWindow, Menu, ipcMain, globalShortcut} = require('electron');
const {autoUpdater} = require("electron-updater");

const path = require('path');
const package = require('./package');
const url = require('url');

let pluginName;
let pluginVersion;
let mainWindow;

switch (process.platform) {
    case 'win32':
        if (process.arch === "x32" || process.arch === "ia32") {
            pluginName = 'pepflashplayer-32.dll';
            pluginVersion = '32.0.0.363';
        } else {
            pluginName = 'pepflashplayer.dll';
            pluginVersion = '32.0.0.363';
        }
        break;
}

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch('high-dpi-support', "1");
app.commandLine.appendSwitch('force-device-scale-factor', "1");
app.commandLine.appendSwitch("--enable-npapi");
app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname.includes(".asar") ? process.resourcesPath : __dirname, "flash/" + pluginName));

Menu.setApplicationMenu(null)

let sendWindow = (identifier, message) => {
    mainWindow.webContents.send(identifier, message);
};

let createWindow = async () => {
    mainWindow = new BrowserWindow({
        title: package.productName,
        icon: path.join(__dirname, '/icon.ico'),
        webPreferences: {
            plugins: true,
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            webSecurity: false
        },
        show: false,
        frame: true,
        backgroundColor: "#000",
    });
    mainWindow.maximize();
    mainWindow.show();

    await mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, `app.html`),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders["X-APP"] = app.getVersion()
        callback({ requestHeaders: details.requestHeaders })
    });

    mainWindow.webContents.on("new-window", function(event, url) {
        if (url.indexOf("/hotel") === -1) {
            return;
        }

        event.preventDefault();
        mainWindow.webContents.executeJavaScript('enterHotel();');
    });

    mainWindow.webContents.on("new-window", function(event, url) {
        if (url.indexOf("/facebook") === -1) {
            return;
        }

        event.preventDefault();
        mainWindow.webContents.executeJavaScript('enterFacebook();');
    });

    sendWindow("version", app.getVersion());

    if (package.debug) {
        mainWindow.webContents.openDevTools();
    } else {
        globalShortcut.register("CTRL+SHIFT+F10", () => {
            mainWindow.webContents.openDevTools();
        });
    }

    ipcMain.on('cache', async () => {
        let session = mainWindow.webContents.session;
        await session.clearCache();
        app.relaunch();
        app.exit();
    });

    ipcMain.on('webCache', async () => {
        let session = mainWindow.webContents.session;
        await session.clearCache();
        app.relaunch();
        app.exit();
    });

    ipcMain.on('fullscreen', () => {
        if (mainWindow.isFullScreen())
            mainWindow.setFullScreen(false);
        else
            mainWindow.setFullScreen(true);
    });

    ipcMain.on('zoomOut', () => {
        let factor = mainWindow.webContents.getZoomFactor();
        if (factor > 0.3) {
            mainWindow.webContents.setZoomFactor(factor - 0.01);
        }
    });

    ipcMain.on('zoomIn', () => {
        let factor = mainWindow.webContents.getZoomFactor();
        if (factor < 3) {
            mainWindow.webContents.setZoomFactor(factor + 0.01);
        }
    });

    ipcMain.on('reload', () => {
        mainWindow.reload();
    });

    ipcMain.on('facebook', function (event, arg) {
        var options = {
            client_id: package.clientId,
            scopes: 'email',
            redirect_uri: 'https://www.facebook.com/connect/login_success.html'
        };

        var authWindow = new BrowserWindow({
            width: 600,
            height: 300,
            show: false,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                nodeIntegration: false
            }
        });

        var facebookAuthURL = `https://www.facebook.com/v3.2/dialog/oauth?client_id=${options.client_id}&redirect_uri=${options.redirect_uri}&response_type=token,granted_scopes&scope=${options.scopes}&display=popup`;

        authWindow.loadURL(facebookAuthURL);
        authWindow.webContents.on('did-finish-load', function () {
            authWindow.show();
        });

        var access_token, error;
        var closedByUser = true;

        var handleUrl = function (url) {
            var raw_code = /access_token=([^&]*)/.exec(url) || null;
            access_token = (raw_code && raw_code.length > 1) ? raw_code[1] : null;
            error = /\?error=(.+)$/.exec(url);

            if (access_token || error) {
                closedByUser = false;
                mainWindow.webContents.executeJavaScript('redirectFacebook();');
                authWindow.close();
            }
        }

        authWindow.webContents.on('will-navigate', (event, url) => handleUrl(url));
        var filter = {
            urls: [options.redirect_uri + '*']
        };
        mainWindow.webContents.session.webRequest.onCompleted(filter, (details) => {
            var url = details.url;
            handleUrl(url);
        });

        authWindow.on('close', () => event.returnValue = closedByUser ? { error: 'The popup window was closed' } : { access_token, error })
    });
};

app.on('ready', async () => {
    await createWindow();
    await autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', async () => {
    if (mainWindow === null) {
        await createWindow();
    }
});

autoUpdater.on('checking-for-update', () => {
    sendWindow('checking-for-update', '');
});

autoUpdater.on('update-available', () => {
    sendWindow('update-available', '');
});

autoUpdater.on('update-not-available', () => {
    sendWindow('update-not-available', '');
});

autoUpdater.on('error', (err) => {
    sendWindow('error', 'Error: ' + err);
});

autoUpdater.on('download-progress', (d) => {
    sendWindow('download-progress', {
        speed: d.bytesPerSecond,
        percent: d.percent,
        transferred: d.transferred,
        total: d.total
    });
});

autoUpdater.on('update-downloaded', () => {
    sendWindow('update-downloaded', 'Update downloaded');
    autoUpdater.quitAndInstall();
});