// 青穗集 · Windows 启动器：单实例、浏览器入口、托盘完全退出与归属本程序的进程树管理。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class LaunchOptions {
    public bool Quit, Headless, NoBrowser;
    public string DataDir;
    public int Port;
    public static LaunchOptions Read(string[] args) {
        var result = new LaunchOptions();
        for (int i = 0; i < args.Length; i++) {
            switch (args[i]) {
                case "--quit": result.Quit = true; break;
                case "--wait": break;
                case "--headless": result.Headless = true; break;
                case "--no-browser": result.NoBrowser = true; break;
                case "--data-dir":
                    if (++i >= args.Length || !Path.IsPathRooted(args[i])) throw new ArgumentException("资料目录必须使用完整路径。");
                    result.DataDir = Path.GetFullPath(args[i]); break;
                case "--port":
                    if (++i >= args.Length || !int.TryParse(args[i], out result.Port) || result.Port < 1024 || result.Port > 65535) throw new ArgumentException("端口不合法。");
                    break;
                default: throw new ArgumentException("不支持的启动参数。");
            }
        }
        return result;
    }
}

internal static class Program {
    public static int ExitCode;
    [STAThread]
    private static int Main(string[] args) {
        LaunchOptions options = null;
        try {
            options = LaunchOptions.Read(args);
            var user = WindowsIdentity.GetCurrent().User.Value;
            using (var sha = SHA256.Create()) user = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(user + "|" + (options.DataDir ?? "default").ToUpperInvariant()))).Replace("-", "").Substring(0, 24);
            var key = "Qingsuiji.Desktop." + user;
            if (options.Quit) return Send(key, "quit", true);
            bool created;
            using (var single = new Mutex(true, "Local\\" + key, out created)) {
                if (!created) return Send(key, options.NoBrowser ? "ping" : "open", false);
                try {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    using (var app = new DesktopContext(options, key)) Application.Run(app);
                    return ExitCode;
                } finally { single.ReleaseMutex(); }
            }
        } catch (Exception error) {
            if (options == null || !options.Headless) MessageBox.Show(error.Message, "青穗集", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }
    private static int Send(string key, string command, bool wait) {
        Mutex current;
        try { current = Mutex.OpenExisting("Local\\" + key); }
        catch (WaitHandleCannotBeOpenedException) { return command == "quit" ? 0 : 2; }
        using (current) {
            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    using (var pipe = new NamedPipeClientStream(".", key, PipeDirection.InOut)) {
                        pipe.Connect(2000);
                        using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true)) {
                            writer.AutoFlush = true; writer.WriteLine(command);
                            using (var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, true)) if (reader.ReadLine() != "ok") return 2;
                        }
                    }
                    if (!wait) return 0;
                    try { if (!current.WaitOne(35000)) return 3; }
                    catch (AbandonedMutexException) { }
                    current.ReleaseMutex(); return 0;
                } catch (IOException) { Thread.Sleep(250); }
                  catch (TimeoutException) { Thread.Sleep(250); }
            }
        }
        return 2;
    }
    public static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
}

internal sealed class DesktopContext : ApplicationContext {
    private readonly LaunchOptions options;
    private readonly string key, root, logDir, logPath;
    private readonly object logGate = new object();
    private readonly Control dispatch = new Control();
    private readonly NotifyIcon tray;
    private readonly TaskCompletionSource<bool> ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    private Process child;
    private ProcessJob job;
    private NamedPipeServerStream pipe;
    private int closing;
    private bool started, openWhenReady;
    private int port;
    private string version;

    public DesktopContext(LaunchOptions options, string key) {
        this.options = options; this.key = key;
        root = AppDomain.CurrentDomain.BaseDirectory;
        logDir = options.DataDir == null ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Qingsuiji", "desktop", "logs") : Path.Combine(options.DataDir, "desktop-logs");
        Directory.CreateDirectory(logDir); logPath = Path.Combine(logDir, "launcher.log");
        if (File.Exists(logPath) && new FileInfo(logPath).Length > 2 * 1024 * 1024) {
            var old = logPath + ".previous"; if (File.Exists(old)) File.Delete(old); File.Move(logPath, old);
        }
        var handle = dispatch.Handle;
        if (!options.Headless) {
            tray = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = "青穗集 · 正在启动", Visible = true };
            var menu = new ContextMenuStrip();
            menu.Items.Add("打开青穗集", null, (s, e) => OpenBrowser());
            menu.Items.Add("查看运行日志", null, (s, e) => OpenFolder(logDir));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("完全退出", null, (s, e) => RequestQuit(true));
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => OpenBrowser();
        }
        openWhenReady = !options.NoBrowser;
        Task.Run((Action)Listen);
        var timer = new System.Windows.Forms.Timer { Interval = 1 };
        timer.Tick += async (s, e) => { timer.Stop(); timer.Dispose(); await StartAsync(); };
        timer.Start();
    }
    private void Log(string value) { lock (logGate) { try { File.AppendAllText(logPath, DateTimeOffset.Now.ToString("o") + " " + value + Environment.NewLine, new UTF8Encoding(false)); } catch (IOException) { } } }
    private void Post(Action action) { if (!dispatch.IsDisposed) try { dispatch.BeginInvoke(action); } catch (InvalidOperationException) { } }
    private void Listen() {
        while (Volatile.Read(ref closing) == 0) {
            try {
                var security = new PipeSecurity(); var sid = WindowsIdentity.GetCurrent().User;
                security.SetAccessRuleProtection(true, false); security.SetOwner(sid);
                security.AddAccessRule(new PipeAccessRule(sid, PipeAccessRights.FullControl, AccessControlType.Allow));
                using (var server = new NamedPipeServerStream(key, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.None, 4096, 4096, security)) {
                    pipe = server; server.WaitForConnection();
                    using (var reader = new StreamReader(server, Encoding.UTF8, false, 1024, true))
                    using (var writer = new StreamWriter(server, new UTF8Encoding(false), 1024, true)) {
                        var command = reader.ReadLine(); writer.AutoFlush = true;
                        if (command == "open" || command == "quit" || command == "ping") { writer.WriteLine("ok"); if (command != "ping") Post(command == "open" ? (Action)OpenBrowser : () => RequestQuit(false)); }
                        else writer.WriteLine("invalid");
                    }
                }
            } catch (IOException) { if (Volatile.Read(ref closing) == 0) Thread.Sleep(100); }
              catch (ObjectDisposedException) { break; }
              catch (Exception error) { Log("控制通道：" + error.Message); break; }
        }
    }
    private string PackagePath(string relative) {
        var path = Path.GetFullPath(Path.Combine(root, relative));
        if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new IOException("发行文件路径无效。");
        return path;
    }
    private static int FreePort(int requested) {
        var candidate = requested == 0 ? 8110 : requested;
        var listener = new TcpListener(IPAddress.Loopback, candidate);
        try { listener.Start(); listener.Stop(); return candidate; }
        catch (SocketException) { listener.Stop(); throw new IOException("本机端口 " + candidate + " 正在使用。请先关闭开发服务或退出已有青穗集后重试；不会启动第二套服务或结束其他进程。"); }
    }
    private async Task StartAsync() {
        try {
            var manifest = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(PackagePath("release.json"), Encoding.UTF8));
            version = Convert.ToString(manifest["version"]); port = FreePort(options.Port);
            var info = new ProcessStartInfo {
                FileName = PackagePath("runtime\\node.exe"), Arguments = Program.Quote(PackagePath("app\\agent\\dist\\desktop.js")),
                WorkingDirectory = PackagePath("app\\agent"), UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            };
            // 不继承开发机的密钥、NODE_OPTIONS 或云端配置；只携带公开服务地址。
            var remove = new List<string>();
            foreach (string name in info.EnvironmentVariables.Keys) if (name.StartsWith("AGENT_", StringComparison.OrdinalIgnoreCase) || name.StartsWith("OFFICIAL_", StringComparison.OrdinalIgnoreCase) || name.StartsWith("RELAY_", StringComparison.OrdinalIgnoreCase) || name.StartsWith("HUB_", StringComparison.OrdinalIgnoreCase) || name.StartsWith("DOTENV_", StringComparison.OrdinalIgnoreCase) || name == "NODE_OPTIONS" || name == "NODE_PATH") remove.Add(name);
            foreach (var name in remove) info.EnvironmentVariables.Remove(name);
            info.EnvironmentVariables["AGENT_PORT"] = port.ToString();
            info.EnvironmentVariables["AGENT_ALLOWED_ORIGINS"] = "http://127.0.0.1:" + port;
            info.EnvironmentVariables["AGENT_CLOUD_URL"] = "https://agent.suinai.me";
            info.EnvironmentVariables["OFFICIAL_GATEWAY_URL"] = "https://api.suinai.me/v1";
            info.EnvironmentVariables["OFFICIAL_MODEL"] = "Suinai Flash";
            info.EnvironmentVariables["OFFICIAL_MODEL_DISPLAY_NAME"] = "Suinai Flash";
            info.EnvironmentVariables["QINGSUIJI_VERSION"] = version;
            info.EnvironmentVariables["DOTENV_CONFIG_PATH"] = PackagePath("app\\configuration-not-loaded.env");
            if (options.DataDir != null) info.EnvironmentVariables["AGENT_DATA_DIR"] = options.DataDir;
            child = new Process { StartInfo = info, EnableRaisingEvents = true };
            child.OutputDataReceived += (s, e) => {
                if (e.Data == null) return;
                if (e.Data.StartsWith("QINGSUIJI_READY ")) ready.TrySetResult(true);
                else if (e.Data == "QINGSUIJI_EXIT_REQUEST") Post(() => RequestQuit(false));
                Log(e.Data);
            };
            child.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            child.Exited += (s, e) => {
                ready.TrySetException(new IOException("本机服务未能启动，请查看运行日志。"));
                if (started && Volatile.Read(ref closing) == 0) Post(() => { Program.ExitCode = 1; if (!options.Headless) MessageBox.Show("本机服务已停止。已保存的资料仍在，可以重新打开青穗集。", "青穗集", MessageBoxButtons.OK, MessageBoxIcon.Warning); RequestQuit(false); });
            };
            job = new ProcessJob();
            if (!child.Start()) throw new IOException("无法启动本机服务。");
            try { job.Assign(child); } catch { try { child.Kill(); } catch { } throw; }
            child.BeginOutputReadLine(); child.BeginErrorReadLine();
            if (await Task.WhenAny(ready.Task, Task.Delay(45000)) != ready.Task) throw new IOException("本机服务启动较慢，请查看运行日志后重试。");
            await ready.Task; started = true;
            Log("启动完成 v" + version + " http://127.0.0.1:" + port);
            if (tray != null) tray.Text = "青穗集 · 本机服务运行中";
            if (openWhenReady) OpenBrowser();
        } catch (Exception error) {
            Log("启动失败：" + error.Message); Program.ExitCode = 1;
            if (!options.Headless) MessageBox.Show(error.Message + "\n\n日志：" + logDir, "青穗集", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            RequestQuit(false);
        }
    }
    private void OpenBrowser() {
        if (!started) { openWhenReady = true; return; }
        if (Volatile.Read(ref closing) != 0) return;
        try { Process.Start(new ProcessStartInfo("http://127.0.0.1:" + port + "/") { UseShellExecute = true }); }
        catch (Exception error) { Log("浏览器：" + error.Message); if (!options.Headless) MessageBox.Show("请在浏览器打开：http://127.0.0.1:" + port, "青穗集"); }
    }
    private void OpenFolder(string path) { try { Process.Start(new ProcessStartInfo("explorer.exe", Program.Quote(path)) { UseShellExecute = true }); } catch (Exception error) { Log(error.Message); } }
    private async void RequestQuit(bool confirm) {
        if (Volatile.Read(ref closing) != 0) return;
        if (confirm && MessageBox.Show("完全退出会停止本机任务和手机远程连接。\n已保存的对话、画像和文件不会删除。", "完全退出青穗集？", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
        if (Interlocked.Exchange(ref closing, 1) != 0) return;
        if (tray != null) tray.Text = "青穗集 · 正在退出";
        await Task.Run(() => {
            if (child == null) return;
            try {
                if (!child.HasExited) {
                    child.StandardInput.WriteLine("{\"command\":\"shutdown\"}"); child.StandardInput.Flush();
                    if (!child.WaitForExit(25000)) { Log("优雅退出超时，结束本程序拥有的进程树。"); if (job != null) { job.Dispose(); job = null; } child.WaitForExit(5000); }
                }
            } catch (Exception error) { Log("退出：" + error.Message); }
        });
        Log("已完全退出"); ExitThread();
    }
    protected override void Dispose(bool disposing) {
        if (disposing) {
            Interlocked.Exchange(ref closing, 1);
            if (tray != null) { tray.Visible = false; if (tray.ContextMenuStrip != null) tray.ContextMenuStrip.Dispose(); tray.Dispose(); }
            if (job != null) { job.Dispose(); job = null; }
            if (child != null) child.Dispose();
            if (pipe != null) pipe.Dispose(); dispatch.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal sealed class ProcessJob : IDisposable {
    private IntPtr handle;
    public ProcessJob() {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero) throw new IOException("无法创建本机进程管理器。");
        var data = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); data.BasicLimitInformation.LimitFlags = 0x00002000;
        int size = Marshal.SizeOf(data); var memory = Marshal.AllocHGlobal(size);
        try { Marshal.StructureToPtr(data, memory, false); if (!SetInformationJobObject(handle, 9, memory, (uint)size)) throw new IOException("无法启用进程退出保护。"); }
        catch { Dispose(); throw; } finally { Marshal.FreeHGlobal(memory); }
    }
    public void Assign(Process process) { if (!AssignProcessToJobObject(handle, process.Handle)) throw new IOException("无法管理本机服务进程；已取消启动。"); }
    public void Dispose() { var old = Interlocked.Exchange(ref handle, IntPtr.Zero); if (old != IntPtr.Zero) CloseHandle(old); }
    [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] private struct IO_COUNTERS { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
}
