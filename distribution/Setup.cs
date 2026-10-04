// Copyright (c) 2026 KHZ-beep
// SPDX-License-Identifier: MIT
using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
public class Setup {
    [STAThread] public static void Main() {
        Application.EnableVisualStyles();
        var form=new Form { Text="AtomWeft 0.3.2 安装", Width=480, Height=180, StartPosition=FormStartPosition.CenterScreen, FormBorderStyle=FormBorderStyle.FixedDialog, MaximizeBox=false };
        var label=new Label { Left=24, Top=24, Width=420, Height=48, Text="正在校验并安装 AtomWeft…\n请先保存并关闭 PowerPoint。" };
        var progress=new ProgressBar { Left=24, Top=82, Width=416, Style=ProgressBarStyle.Marquee };
        form.Controls.Add(label);form.Controls.Add(progress);
        form.Shown+=async delegate {
            string temp=Path.Combine(Path.GetTempPath(),"AtomWeft-Setup-"+Guid.NewGuid().ToString("N"));
            try {
                if(Process.GetProcessesByName("POWERPNT").Length>0)throw new Exception("请保存并关闭 PowerPoint，再重新运行安装程序。");
                await Task.Run(delegate {
                    Directory.CreateDirectory(temp);
                    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                    using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
                        foreach(var entry in zip.Entries) {
                            var path=Path.GetFullPath(Path.Combine(temp,entry.FullName));
                            if(!path.StartsWith(temp+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid installation path");
                            Directory.CreateDirectory(Path.GetDirectoryName(path));
                            if(entry.Name.Length>0)entry.ExtractToFile(path,true);
                        }
                    }
                    var info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(temp,"install-public.ps1")+"\" -Quiet") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
                    using(var process=Process.Start(info)) {
                        var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
                        process.WaitForExit();Task.WaitAll(output,error);
                        if(process.ExitCode!=0)throw new Exception(error.Result+"\n"+output.Result);
                    }
                });
                MessageBox.Show(form,"安装完成。重新打开 PowerPoint，即可使用 AtomWeft 选项卡。\n也可以从开始菜单打开 AtomWeft。","AtomWeft");
            } catch(Exception ex) {MessageBox.Show(form,"安装未完成：\n"+ex.Message,"AtomWeft",MessageBoxButtons.OK,MessageBoxIcon.Error);}
            finally {
                // Only the uniquely created, verified temporary extraction directory is removed.
                var expected=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(Path.GetFullPath(temp).StartsWith(expected,StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(temp).StartsWith("AtomWeft-Setup-")) {try{Directory.Delete(temp,true);}catch{}}
                form.Close();
            }
        };
        Application.Run(form);
    }
}
