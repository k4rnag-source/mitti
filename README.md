# Mitti — 3D Desktop Labrador Companion

Mitti is a Windows desktop companion with a transparent, always-on-top 3D pet window.

This build provides:
- 3D retriever-based black Labrador styling.
- Autonomous roaming and randomized behaviour.
- Window-edge perch behaviour.
- Multi-monitor virtual desktop roaming.
- Mouse drag.
- System tray.
- Global hotkeys.
- Start with Windows.
- Self-contained Windows publish.
- Automatic Windows CI build and installer.

The 3D source assets are pulled during the Windows build from the CC0 companion-animal pack published by 3DAssets.dev. The pack provides retriever standing, sitting and lying assets; Mitti applies a black Labrador material treatment and desktop behaviour around them.

For the normal user, the intended flow is simply: install MittiSetup.exe, then Mitti starts with Windows.

This repository is designed to be built on a real Windows runner because the final application uses WPF/WebView2 and Windows APIs.
