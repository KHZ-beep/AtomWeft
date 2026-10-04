// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[ComImport, Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
public interface IDTExtensibility2 {
    [DispId(1)] void OnConnection([In, MarshalAs(UnmanagedType.IDispatch)] object app, [In] int mode, [In, MarshalAs(UnmanagedType.IDispatch)] object addin, [In, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_VARIANT)] ref Array custom);
    [DispId(2)] void OnDisconnection([In] int mode, [In, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_VARIANT)] ref Array custom);
    [DispId(3)] void OnAddInsUpdate([In, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_VARIANT)] ref Array custom);
    [DispId(4)] void OnStartupComplete([In, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_VARIANT)] ref Array custom);
    [DispId(5)] void OnBeginShutdown([In, MarshalAs(UnmanagedType.SafeArray, SafeArraySubType=VarEnum.VT_VARIANT)] ref Array custom);
}
[ComImport, Guid("000C0396-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
public interface IRibbonExtensibility {
    [DispId(1)] [return: MarshalAs(UnmanagedType.BStr)] string GetCustomUI([MarshalAs(UnmanagedType.BStr)] string ribbonID);
}
[ComVisible(true), Guid("2F335A43-2D2D-42DD-ADBD-F7B2D3C50811"), InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
public interface IAtomWeftCallbacks {
    [DispId(10)] void OpenEditor([MarshalAs(UnmanagedType.IDispatch)] object control);
}
[ComVisible(true), Guid("4BE86AD6-219F-4A1D-A8D8-AE33C54DF52F"), ProgId("AtomWeft.Connect"),
 ClassInterface(ClassInterfaceType.None), ComDefaultInterface(typeof(IAtomWeftCallbacks))]
public class Connect : IDTExtensibility2, IRibbonExtensibility, IAtomWeftCallbacks {
    public Connect() { Log("COM instance created"); }
    private static void Log(string message) {
        try { File.AppendAllText(Path.Combine(Path.GetDirectoryName(typeof(Connect).Assembly.Location), "addin.log"), DateTime.Now.ToString("s") + " " + message + Environment.NewLine); }
        catch { }
    }
    private Process server;
    private string address;
    private int launching;
    public string GetCustomUI(string ribbonID) {
        Log("GetCustomUI " + ribbonID);
        return "<customUI xmlns='http://schemas.microsoft.com/office/2009/07/customui'><ribbon><tabs><tab id='AtomWeftTab' label='AtomWeft'><group id='AtomWeftGroup' label='分子结构'><button id='AtomWeftOpen' label='导入分子结构' size='large' imageMso='FileOpen' onAction='OpenEditor' screentip='AtomWeft 分子编辑器' supertip='导入 CIF / MOL / PDB / XYZ，选择角度，以可编辑形状插入当前幻灯片。'/></group></tab></tabs></ribbon></customUI>";
    }
    public void OpenEditor(object control) {
        Log("OpenEditor");
        if (Interlocked.Exchange(ref launching, 1) != 0) return;
        ThreadPool.QueueUserWorkItem(delegate {
            try {
                if (server == null || server.HasExited || String.IsNullOrEmpty(address)) {
                    string folder = Path.GetDirectoryName(typeof(Connect).Assembly.Location);
                    string root = Path.GetFullPath(Path.Combine(folder, ".."));
                    string python = Path.Combine(root, "runtime", "python.exe");
                    if (!File.Exists(python)) python = File.ReadAllText(Path.Combine(folder, "python-path.txt")).Trim();
                    ProcessStartInfo info = new ProcessStartInfo(python, "\"" + Path.Combine(root, "server.py") + "\" --no-browser");
                    info.WorkingDirectory = root;
                    info.UseShellExecute = false;
                    info.CreateNoWindow = true;
                    info.RedirectStandardOutput = true;
                    server = Process.Start(info);
                    address = server.StandardOutput.ReadLine();
                    if (String.IsNullOrEmpty(address) || !address.StartsWith("http://127.0.0.1:"))
                        throw new Exception("本地服务启动失败。请双击 launch.cmd 查看依赖是否就绪。");
                    Log("Local server ready");
                }
                Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
            } catch (Exception ex) { Log("Error: " + ex.Message); MessageBox.Show(ex.Message, "AtomWeft"); }
            finally { Interlocked.Exchange(ref launching, 0); }
        });
    }
    public void OnConnection(object app, int mode, object addin, ref Array custom) { Log("OnConnection mode=" + mode); }
    public void OnDisconnection(int mode, ref Array custom) { Log("OnDisconnection mode=" + mode); }
    public void OnAddInsUpdate(ref Array custom) { }
    public void OnStartupComplete(ref Array custom) { }
    public void OnBeginShutdown(ref Array custom) { }
}
