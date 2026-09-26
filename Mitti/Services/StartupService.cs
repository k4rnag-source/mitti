using Microsoft.Win32;
using System;

namespace Mitti.Services;

public static class StartupService
{
    private const string RunKey = @"SoftwareMicrosoftWindowsCurrentVersionRun";
    private const string ValueName = "Mitti";

    public static void Enable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        if (key == null) return;
        var exe = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(exe))
            key.SetValue(ValueName, """ + exe + """);
    }

    public static void Disable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        key?.DeleteValue(ValueName, false);
    }
}
