using System;
using System.Runtime.InteropServices;

namespace Mitti.Services;

internal static class NativeWindows
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    public static bool TryGetForegroundRect(IntPtr ownHandle, out RECT rect)
    {
        rect = default;
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero || hwnd == ownHandle || !IsWindowVisible(hwnd))
            return false;
        return GetWindowRect(hwnd, out rect);
    }
}
