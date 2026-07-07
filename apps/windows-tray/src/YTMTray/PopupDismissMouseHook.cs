using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class PopupDismissMouseHook : IDisposable
{
    private const int WH_MOUSE_LL = 14;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MBUTTONDOWN = 0x0207;
    private const int WM_XBUTTONDOWN = 0x020B;

    private readonly Form popup;
    private readonly Action dismissPopup;
    private readonly NativeAppLogger? logger;
    private readonly LowLevelMouseProc hookCallback;
    private IntPtr hookHandle;
    private bool dismissQueued;
    private bool disposed;

    public PopupDismissMouseHook(
        Form popup,
        Action dismissPopup,
        NativeAppLogger? logger = null
    )
    {
        this.popup = popup;
        this.dismissPopup = dismissPopup;
        this.logger = logger;
        hookCallback = HandleMouseEvent;
    }

    public void Install()
    {
        if (disposed || hookHandle != IntPtr.Zero) return;

        using var currentProcess = Process.GetCurrentProcess();
        using var currentModule = currentProcess.MainModule;
        var moduleHandle = currentModule is null
            ? IntPtr.Zero
            : GetModuleHandle(currentModule.ModuleName);

        hookHandle = SetWindowsHookEx(WH_MOUSE_LL, hookCallback, moduleHandle, 0);
        if (hookHandle == IntPtr.Zero)
        {
            logger?.Log(
                $"windows tray popup dismiss hook failed: {Marshal.GetLastWin32Error()}"
            );
        }
    }

    public void Uninstall()
    {
        if (hookHandle == IntPtr.Zero) return;

        if (!UnhookWindowsHookEx(hookHandle))
        {
            logger?.Log(
                $"windows tray popup dismiss hook cleanup failed: {Marshal.GetLastWin32Error()}"
            );
        }
        hookHandle = IntPtr.Zero;
        dismissQueued = false;
    }

    public void Dispose()
    {
        disposed = true;
        Uninstall();
    }

    private IntPtr HandleMouseEvent(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (
            nCode >= 0
            && IsMouseDownMessage(wParam)
            && popup.Visible
            && !popup.IsDisposed
            && !dismissQueued
        )
        {
            var hookEvent = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
            var point = new Point(hookEvent.pt.x, hookEvent.pt.y);
            if (!popup.Bounds.Contains(point))
            {
                dismissQueued = true;
                try
                {
                    popup.BeginInvoke(
                        (MethodInvoker)(() =>
                        {
                            dismissQueued = false;
                            if (!popup.IsDisposed && popup.Visible)
                            {
                                dismissPopup();
                            }
                        })
                    );
                }
                catch (InvalidOperationException)
                {
                    dismissQueued = false;
                }
            }
        }

        return CallNextHookEx(hookHandle, nCode, wParam, lParam);
    }

    private static bool IsMouseDownMessage(IntPtr message)
    {
        var messageValue = message.ToInt32();
        return messageValue
            is WM_LBUTTONDOWN
                or WM_RBUTTONDOWN
                or WM_MBUTTONDOWN
                or WM_XBUTTONDOWN;
    }

    private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct POINT
    {
        public readonly int x;
        public readonly int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct MSLLHOOKSTRUCT
    {
        public readonly POINT pt;
        public readonly uint mouseData;
        public readonly uint flags;
        public readonly uint time;
        public readonly IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(
        int idHook,
        LowLevelMouseProc lpfn,
        IntPtr hMod,
        uint dwThreadId
    );

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(
        IntPtr hhk,
        int nCode,
        IntPtr wParam,
        IntPtr lParam
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
