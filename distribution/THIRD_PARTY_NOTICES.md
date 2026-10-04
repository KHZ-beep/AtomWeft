# Third-party notices

AtomWeft includes unmodified binary distributions and accompanying license files:

- Python 3.13.16: PSF license and bundled third-party notices, `runtime/LICENSE.txt`. Official source: https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip
- Gemmi 0.7.5: Mozilla Public License 2.0 (MPL-2.0). Full license: `vendor/gemmi-0.7.5.dist-info/licenses/LICENSE.txt`. Corresponding versioned source is available under the MPL-2.0 at https://github.com/project-gemmi/gemmi/tree/v0.7.5 (GitHub Code → Download ZIP), with release files at https://pypi.org/project/gemmi/0.7.5/#files. AtomWeft does not modify Gemmi. Recipients retain the rights granted by MPL-2.0 to this component; AtomWeft does not impose additional restrictions on those rights.
- RDKit 2026.3.6: RDKit core is BSD-3-Clause, full notice in `vendor/rdkit/license.txt`; the wheel build project has an MIT notice in `vendor/rdkit-2026.3.6.dist-info/LICENSE.md`. These are separate notices and neither replaces the other. Upstream project: https://github.com/rdkit/rdkit ; wheel build project: https://github.com/kuelumbus/rdkit-pypi . Additional bundled notices, including fonts, remain in the package.
- NumPy 2.5.3: license and bundled library notices under `vendor/numpy-2.5.3.dist-info`.
- Pillow 12.3.0: license and bundled library notices under `vendor/pillow-12.3.0.dist-info`.
- pywin32 312: license under `vendor/pywin32-312.dist-info`.

Third-party copyright and license notices are retained. No ownership of these components is claimed. Dependency versions and hashes are recorded in the installation manifest.

This list identifies direct packaged components, not a legal clearance of every transitive dependency, patent, or trademark. Refer to the license files shipped inside each component for full terms. AtomWeft is an independent application and is not endorsed by the above projects or by Microsoft.
