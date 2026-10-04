# Build the Windows package

Use Windows x64 with Python 3.13 and the .NET Framework C# compiler. Run commands from the repository root.

1. Install the pinned direct dependencies into `vendor` using `setup.cmd` or the README command. Binary dependencies keep their complete license directories. For an exact reproduction also record/pin resolved transitive dependencies; the direct requirements alone are not a complete lockfile.
2. Download `https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip` to `build/downloads/python-3.13.16-embed-amd64.zip`.
3. Verify its SHA-256: `97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297`. The builder checks it before extraction.
4. Run `python tests/run_all.py`, then `python distribution/build_public.py`.
5. Outputs go to `dist/`. The package includes the project LICENSE and COPYRIGHT.md, third-party notices, and original dependency license files. Check the resulting manifest, privacy audit and clean-machine installation before distributing a newly built binary.

The previous 0.3.2 installers were built before this source publication review and are not attached to this initial source release. This repository includes the dense-bond limit fix documented in the review. The current build script retains the 0.3.2 version label; assign a new release version consistently before publishing updated installers.
