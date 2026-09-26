#define MyAppName "Mitti"
#define MyAppVersion "1.0.0"

[Setup]
AppId={{A8D7F0D0-0A8E-4C61-98B8-A4E3DE51A912}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\Mitti
DefaultGroupName=Mitti
OutputDir=..\artifacts\installer
OutputBaseFilename=MittiSetup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern

[Files]
Source: "..\artifacts\publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "..\artifacts\WebView2\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\Mitti"; Filename: "{app}\Mitti.exe"
Name: "{userdesktop}\Mitti"; Filename: "{app}\Mitti.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; Flags: unchecked

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Flags: shellexec waituntilterminated skipifsilent
Filename: "{app}\Mitti.exe"; Description: "Launch Mitti"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
