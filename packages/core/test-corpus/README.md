# Third-party test corpus

Real device files used only by tests, to check the importers against data the project did not
generate. Each directory keeps the upstream licence. Files are unmodified copies.

| Directory    | Source                                                                                | Commit         | Licence      |
| ------------ | ------------------------------------------------------------------------------------- | -------------- | ------------ |
| `fitparse/`  | [dtcooper/python-fitparse](https://github.com/dtcooper/python-fitparse) `tests/files` | `d88bb6997138` | MIT          |
| `gpxpy/`     | [tkrajina/gpxpy](https://github.com/tkrajina/gpxpy) `test_files`                      | `8bbf933eac9a` | Apache-2.0   |
| `tcxparser/` | [vkurup/python-tcxparser](https://github.com/vkurup/python-tcxparser) `tests/files`   | `5ecaac92f8f2` | BSD-2-Clause |

The `*-records.csv` files in `fitparse/` are python-fitparse's own decoded output for the matching
FIT file, so they act as an independent decoder reference. `gpxpy/NOTICE.txt` is gpxpy's NOTICE
file, which Apache-2.0 section 4(d) requires to be kept with the files.
