; Inno Setup Script for Kutuphane Application
; This script creates a Windows installer that includes the application and database setup

#define AppName "Kutuphane"
#define AppVersion "1.0.0"
#define AppPublisher "Kutuphane Yayıncılık"
#define AppURL "https://www.kutuphane.com"
#define AppExeName "Kutuphane.Api.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=dist
OutputBaseFilename=KutuphaneSetup
SetupIconFile=
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Application files (includes .NET 8 runtime and SQLite - no separate installation needed)
Source: "..\src\Kutuphane.Api\bin\Release\net8.0\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Database setup script
Source: "DatabaseSetup.bat"; DestDir: "{app}"; Flags: ignoreversion
; SQLite is included in .NET 8 runtime, no separate installation needed
; Database will be created automatically on first run at: %LocalAppData%\KutuphaneApp\kutuphane.db

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: quicklaunchicon

[Run]
; Run database setup script
Filename: "{app}\DatabaseSetup.bat"; StatusMsg: "Veritabanı kurulumu yapılıyor..."; Flags: runhidden
; Start the application (optional)
; Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{userappdata}\KutuphaneApp"

[Code]
procedure InitializeWizard;
begin
  // Custom initialization code can go here
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  // Check for .NET 8 Runtime
  // If not installed, show message or download
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Post-installation tasks
  end;
end;



