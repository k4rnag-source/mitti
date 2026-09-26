using System.Windows;

namespace Mitti;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var w = new MainWindow();
        MainWindow = w;
        w.Show();
    }
}
