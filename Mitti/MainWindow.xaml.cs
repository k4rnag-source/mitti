using Microsoft.Web.WebView2.Core;
using Mitti.Services;
using System;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using System.Windows.Interop;
using WinForms = System.Windows.Forms;

namespace Mitti;

public partial class MainWindow : Window
{
    DispatcherTimer? timer;
    GlobalHotkeyService? hotkeys;
    WinForms.NotifyIcon? tray;
    readonly Random rng = new();
    bool paused;
    bool dragging;
    Point dragOffset;
    double velocity = 95;
    DateTime nextDecision = DateTime.UtcNow.AddSeconds(2);
    bool sleeping;
    DateTime wakeAt;
    bool visible = true;

    public MainWindow() => InitializeComponent();

    async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        Left = SystemParameters.WorkArea.Left + SystemParameters.WorkArea.Width * 0.55;
        Top = SystemParameters.WorkArea.Bottom - Height - 28;

        tray = new WinForms.NotifyIcon {
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            Text = "Mitti Desktop Labrador"
        };
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("Show / Hide", null, (_, _) => ToggleVisible());
        menu.Items.Add("Pause / Resume", null, (_, _) => TogglePause());
        menu.Items.Add("Call Mitti", null, (_, _) => CallMitti());
        menu.Items.Add("Start with Windows", null, (_, _) => StartupService.Enable());
        menu.Items.Add("Exit", null, (_, _) => Close());
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (_, _) => ToggleVisible();

        hotkeys = new GlobalHotkeyService(this);
        hotkeys.Pressed += Hotkey;
        hotkeys.Start();
        StartupService.Enable();

        MouseLeftButtonDown += MouseDown;
        MouseMove += MouseMoveHandler;
        MouseLeftButtonUp += MouseUp;

        var webProfile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Mitti", "WebView2");
        Directory.CreateDirectory(webProfile);

        var env = await CoreWebView2Environment.CreateAsync(null, webProfile);
        await PetView.EnsureCoreWebView2Async(env);
        PetView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        PetView.CoreWebView2.Settings.AreDevToolsEnabled = false;

        PetView.Source = new Uri(Path.Combine(AppContext.BaseDirectory, "web", "index.html")).AbsoluteUri;

        timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(80) };
        timer.Tick += (_, _) => Tick();
        timer.Start();
    }

    void PetView_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        => _ = PetView.ExecuteScriptAsync("window.Mitti?.start?.()");

    void Tick()
    {
        if (paused || dragging) return;
        var now = DateTime.UtcNow;

        if (sleeping)
        {
            if (now >= wakeAt)
            {
                sleeping = false;
                _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('idle')");
                nextDecision = now.AddSeconds(2);
            }
            return;
        }

        if (now >= nextDecision)
        {
            Decide();
            nextDecision = now.AddSeconds(2 + rng.NextDouble() * 6);
        }

        Left += velocity * 0.08;
        ClampToVirtualDesktop();
        _ = PetView.ExecuteScriptAsync(
            $"window.Mitti?.setMoving?.({(Math.Abs(velocity) > 0.1 ? "true" : "false")})");
    }

    void Decide()
    {
        var r = rng.NextDouble();
        if (r < 0.10)
        {
            sleeping = true;
            wakeAt = DateTime.UtcNow.AddSeconds(15 + rng.Next(25));
            velocity = 0;
            _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('sleep')");
        }
        else if (r < 0.23)
        {
            velocity = 0;
            _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('sit')");
        }
        else if (r < 0.35)
        {
            velocity = (rng.Next(2) == 0 ? -1 : 1) * (60 + rng.Next(50));
            _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('walk')");
        }
        else if (r < 0.43)
        {
            PerchOnForeground();
        }
        else
        {
            velocity = (rng.Next(2) == 0 ? -1 : 1) * (105 + rng.Next(120));
            _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('run')");
        }
    }

    void PerchOnForeground()
    {
        var own = new WindowInteropHelper(this).Handle;
        if (!NativeWindows.TryGetForegroundRect(own, out var rect)) return;
        Left = rect.Left + Math.Max(0, ((rect.Right - rect.Left) - Width) * rng.NextDouble());
        Top = Math.Max(8, rect.Top - Height * 0.60);
        velocity = 0;
        _ = PetView.ExecuteScriptAsync("window.Mitti?.perch?.()");
    }

    void ClampToVirtualDesktop()
    {
        var l = SystemParameters.VirtualScreenLeft;
        var r = l + SystemParameters.VirtualScreenWidth - Width;
        var t = SystemParameters.VirtualScreenTop;
        var b = t + SystemParameters.VirtualScreenHeight - Height - 6;

        if (Left <= l) { Left = l; velocity = Math.Abs(velocity); }
        if (Left >= r) { Left = r; velocity = -Math.Abs(velocity); }
        if (Top < t) Top = t;
        if (Top > b) Top = b;
    }

    void MouseDown(object sender, MouseButtonEventArgs e)
    {
        dragging = true;
        dragOffset = e.GetPosition(this);
        CaptureMouse();
        velocity = 0;
    }

    void MouseMoveHandler(object sender, MouseEventArgs e)
    {
        if (!dragging || e.LeftButton != MouseButtonState.Pressed) return;
        var p = e.GetPosition(null);
        Left = p.X - dragOffset.X;
        Top = p.Y - dragOffset.Y;
    }

    void MouseUp(object sender, MouseButtonEventArgs e)
    {
        dragging = false;
        ReleaseMouseCapture();
        nextDecision = DateTime.UtcNow.AddSeconds(1);
    }

    void Hotkey(int id)
    {
        switch (id)
        {
            case 1: ToggleVisible(); break;
            case 2: TogglePause(); break;
            case 3: CallMitti(); break;
            case 4: Close(); break;
        }
    }

    void ToggleVisible()
    {
        visible = !visible;
        Visibility = visible ? Visibility.Visible : Visibility.Hidden;
    }

    void TogglePause()
    {
        paused = !paused;
        _ = PetView.ExecuteScriptAsync($"window.Mitti?.pause?.({paused.ToString().ToLowerInvariant()})");
    }

    void CallMitti()
    {
        visible = true;
        Visibility = Visibility.Visible;
        Left = SystemParameters.WorkArea.Left + SystemParameters.WorkArea.Width / 2 - Width / 2;
        Top = SystemParameters.WorkArea.Bottom - Height - 28;
        paused = false;
        sleeping = false;
        velocity = 115;
        _ = PetView.ExecuteScriptAsync("window.Mitti?.setState?.('happy')");
    }

    void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        timer?.Stop();
        hotkeys?.Dispose();
        tray?.Dispose();
    }
}
