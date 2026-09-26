using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace Mitti.Services;

public sealed class GlobalHotkeyService : IDisposable
{
    const int WM_HOTKEY = 0x0312;
    const uint MOD_CONTROL = 0x0002, MOD_ALT = 0x0001, MOD_NOREPEAT = 0x4000;
    const uint VK_M = 0x4D, VK_P = 0x50, VK_S = 0x53, VK_Q = 0x51;

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    readonly Window window;
    HwndSource? source;
    public event Action<int>? Pressed;

    public GlobalHotkeyService(Window window) => this.window = window;

    public void Start()
    {
        source = (HwndSource)PresentationSource.FromVisual(window)!;
        source.AddHook(WndProc);
        RegisterHotKey(source.Handle, 1, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_M);
        RegisterHotKey(source.Handle, 2, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_P);
        RegisterHotKey(source.Handle, 3, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_S);
        RegisterHotKey(source.Handle, 4, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_Q);
    }

    IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY)
        {
            Pressed?.Invoke(wParam.ToInt32());
            handled = true;
        }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (source == null) return;
        for (int i = 1; i <= 4; i++) UnregisterHotKey(source.Handle, i);
        source.RemoveHook(WndProc);
        source = null;
    }
}
