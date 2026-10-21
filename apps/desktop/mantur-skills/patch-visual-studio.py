"""Build the reviewed desktop adapter overlay from an immutable official Skill ZIP."""
import hashlib
import sys
import zipfile
from pathlib import Path

source, target = map(Path, sys.argv[1:])
if hashlib.sha256(source.read_bytes()).hexdigest() != '980bc9e9f352f1170e0bdfe641a08b7fbaf23854b9f4171d7cc80f1ba674f73b':
    raise SystemExit('Unexpected upstream production Skill archive')
with zipfile.ZipFile(source) as archive, zipfile.ZipFile(target, 'x') as output:
    for entry in archive.infolist():
        data = archive.read(entry)
        if entry.filename == 'scripts/access-base.mjs':
            text = data.decode()
            before = "  if (env.MANTURHUB_IDENTITY_MODE) assert(env.MANTURHUB_IDENTITY_MODE === 'standalone', 'Conflicting channel environment: MANTURHUB_IDENTITY_MODE');"
            after = """  const managed = !connector && env.MANTURHUB_IDENTITY_MODE === 'desktop-managed';
  if (managed) assert(typeof env.MANTURHUB_AGENT_AUTH === 'string' && isAbsolute(env.MANTURHUB_AGENT_AUTH),
    'DESKTOP_LOGIN_REQUIRED: sign in through the desktop application');
  if (env.MANTURHUB_IDENTITY_MODE) assert(managed || env.MANTURHUB_IDENTITY_MODE === 'standalone', 'Conflicting channel environment: MANTURHUB_IDENTITY_MODE');"""
            if text.count(before) != 1:
                raise SystemExit('Upstream managed identity adapter changed')
            text = text.replace(before, after)
            before = "const fixed = { MANTURHUB_CONFIG_DIR: configDir, MANTURHUB_IDENTITY_MODE: 'standalone',"
            if text.count(before) != 1:
                raise SystemExit('Upstream identity environment changed')
            text = text.replace(before, "const fixed = { MANTURHUB_CONFIG_DIR: configDir, MANTURHUB_IDENTITY_MODE: managed ? 'desktop-managed' : 'standalone',")
            data = text.encode()
        output.writestr(entry, data)
