using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

internal static class Program
{
    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(nint hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(nint hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(nint hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(nint hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(nint hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint hWnd, out uint processId);

    private sealed record Result(
        bool Visible,
        bool Minimized,
        string Title,
        string ClassName,
        string Process,
        Rect Bounds);

    private sealed record Rect(int X, int Y, int Width, int Height);

    private static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--watch")
        {
            while (true)
            {
                Console.WriteLine(JsonSerializer.Serialize(Read()));
                Console.Out.Flush();
                Console.ReadLine();
            }
        }
        else
        {
            Console.WriteLine(JsonSerializer.Serialize(Read()));
        }
    }

    private static Result Read()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == nint.Zero || !GetWindowRect(hwnd, out var r))
        {
            return new Result(false, false, "", "", "", new Rect(0, 0, 0, 0));
        }

        var title = new StringBuilder(512);
        var cls = new StringBuilder(256);
        GetWindowText(hwnd, title, title.Capacity);
        GetClassName(hwnd, cls, cls.Capacity);

        _ = GetWindowThreadProcessId(hwnd, out var pid);
        string process = "";
        try
        {
            if (pid != 0) process = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
        }
        catch { }

        return new Result(
            IsWindowVisible(hwnd),
            IsIconic(hwnd),
            title.ToString(),
            cls.ToString(),
            process,
            new Rect(r.Left, r.Top, Math.Max(0, r.Right - r.Left), Math.Max(0, r.Bottom - r.Top)));
    }
}
