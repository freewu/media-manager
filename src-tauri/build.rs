fn main() {
    tauri_build::build();

    // 主程序由 tauri-build/winres 嵌入 Windows 清单（其中声明了 comctl32 v6 依赖），
    // 但 `cargo test` 生成的测试可执行文件不会带这份清单。
    // 缺少 v6 声明时系统会加载旧版 comctl32(v5.82)，而 tao/wry 用到的
    // TaskDialogIndirect 只存在于 v6，进程会在启动阶段直接
    // STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139) 崩溃，因此这里给测试目标补上清单。
    #[cfg(windows)]
    {
        use std::path::PathBuf;

        const MANIFEST: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*" />
    </dependentAssembly>
  </dependency>
</assembly>
"#;

        let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
        let manifest_path = out_dir.join("test-manifest.xml");
        if std::fs::write(&manifest_path, MANIFEST).is_ok() {
            // 只作用于 tests/ 下的测试目标；lib/bin 已由 tauri-build 嵌入清单，
            // 再传 /MANIFEST:EMBED 会报 CVT1100 资源重复。
            println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
            println!(
                "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
                manifest_path.display()
            );
        }
    }
}
