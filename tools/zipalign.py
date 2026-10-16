#!/usr/bin/env python3
"""Minimal zipalign: rewrite a zip so every STORED entry's data starts on a 4-byte boundary
(resources.arsc must be stored + aligned for targetSdk >= 30)."""
import sys
import zipfile

NO_COMPRESS = ('.arsc', '.png', '.jpg', '.ogg', '.mp3', '.wav')


def align(src, dst, alignment=4):
    zin = zipfile.ZipFile(src)
    with zipfile.ZipFile(dst, 'w') as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            ni = zipfile.ZipInfo(info.filename, date_time=(2012, 11, 13, 0, 0, 0))
            ni.external_attr = info.external_attr
            stored = info.compress_type == zipfile.ZIP_STORED or info.filename.endswith(NO_COMPRESS)
            ni.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
            if stored:
                header_end = zout.fp.tell() + 30 + len(ni.filename.encode('utf-8'))
                pad = (-header_end) % alignment
                ni.extra = b'\0' * pad
            zout.writestr(ni, data)
    zin.close()


if __name__ == '__main__':
    align(sys.argv[1], sys.argv[2])
