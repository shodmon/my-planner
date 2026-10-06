const {app,BrowserWindow}=require('electron');const path=require('path');
if(!app.requestSingleInstanceLock())app.quit();
let win;
function createWindow(){
  win=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:600,backgroundColor:'#101216',title:'My Planner',autoHideMenuBar:true,icon:path.join(__dirname,'build','icon.png'),webPreferences:{contextIsolation:true,nodeIntegration:false}});
  win.loadFile(path.join(__dirname,'app','index.html'));
}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
