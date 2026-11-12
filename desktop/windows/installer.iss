; 青穗集 · Windows 安装向导：自选路径、桌面快捷方式、升级前退出与卸载保留用户资料。
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
[Setup]
AppId={{76FB3A62-3659-41A1-B1BF-F5619C927408}
AppName=青穗集
AppVersion={#AppVersion}
AppVerName=青穗集 {#AppVersion}
AppPublisher=青穗集
AppPublisherURL=https://suinai.me
DefaultDirName={localappdata}\Programs\Qingsuiji
DefaultGroupName=青穗集
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
WizardStyle=modern
WizardSizePercent=115
SetupIconFile={#PayloadDir}\Qingsuiji.ico
UninstallDisplayIcon={app}\Qingsuiji.exe
OutputDir={#OutputDir}
OutputBaseFilename=Qingsuiji-{#AppVersion}-windows-x64-setup
Compression=lzma2/fast
SolidCompression=yes
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
SetupLogging=yes
VersionInfoVersion={#AppVersion}.0

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Messages]
WelcomeLabel1=欢迎安装青穗集
WelcomeLabel2=安装完成后，双击桌面图标即可打开浏览器中的青穗集。%n%n聊天和文件保存在用户资料目录，与安装目录分开。
SelectDirDesc=选择青穗集的安装位置。
FinishedLabel=青穗集已安装完成。
FinishedHeadingLabel=准备好和穗奈见面了吗？
ConfirmUninstall=确定要卸载青穗集吗？%n%n本机任务会停止。聊天、画像和文件将保留，不会删除你绑定的项目。

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\青穗集"; Filename: "{app}\Qingsuiji.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\青穗集"; Filename: "{app}\Qingsuiji.exe"; WorkingDir: "{app}"
Name: "{group}\完全退出青穗集"; Filename: "{app}\Qingsuiji.exe"; Parameters: "--quit --wait"; WorkingDir: "{app}"
Name: "{group}\卸载青穗集"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\Qingsuiji.exe"; Description: "启动青穗集"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Qingsuiji.exe"; Parameters: "--quit --wait"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopDesktop"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Existing: String;
  ExitCode: Integer;
  InstalledDir: String;
begin
  Result := '';
  Existing := ExpandConstant('{app}\Qingsuiji.exe');
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{76FB3A62-3659-41A1-B1BF-F5619C927408}_is1', 'InstallLocation', InstalledDir) then
    if FileExists(AddBackslash(InstalledDir) + 'Qingsuiji.exe') then
      Existing := AddBackslash(InstalledDir) + 'Qingsuiji.exe';
  if FileExists(Existing) then begin
    if not WizardSilent then
      if MsgBox('更新前将退出本机青穗集并停止任务。已保存的资料不会删除，是否继续？', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES then begin
        Result := '已取消更新。';
        Exit;
      end;
    if not Exec(Existing, '--quit --wait', ExtractFileDir(Existing), SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Result := '无法关闭旧版青穗集。请从任务栏托盘选择“完全退出”后重试。'
    else if ExitCode <> 0 then
      Result := '青穗集尚未完全退出。请稍后重试安装。';
  end;
end;
