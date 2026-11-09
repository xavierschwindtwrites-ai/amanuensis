#!/bin/bash
# Synthesizes the spoken passage the end-to-end tests dictate, as a 16 kHz WAV with a plain 44-byte header
# (Chromium's fake microphone needs that). Usage: test/fixtures/make-speech.sh /path/to/speech.wav
set -e
OUT="${1:-$(dirname "$0")/speech.wav}"
TMP="$(mktemp -d)"
say -v Samantha -r 175 -o "$TMP/s.aiff" "The rain had not stopped for three days. [[slnc 1300]] Um, Marcus stood at the window and watched the the street below. [[slnc 1300]] Where are you going, she asked. [[slnc 1300]] To find the truth, he said. [[slnc 1300]] New paragraph. The door closed behind him. [[slnc 2500]]"
afconvert -f WAVE -d LEI16@16000 -c 1 "$TMP/s.aiff" "$TMP/s.wav"
node -e "
const fs=require('fs');const A=require('$(cd "$(dirname "$0")/../.." && pwd)/lib/audio.js');const b=fs.readFileSync(process.argv[1]);
const i=b.indexOf('data');const n=b.readUInt32LE(i+4);const pcm=new Int16Array(b.buffer.slice(b.byteOffset+i+8,b.byteOffset+i+8+n));
const all=new Int16Array(16000+pcm.length);all.set(pcm,16000);fs.writeFileSync(process.argv[2],A.encodeWav(all));" "$TMP/s.wav" "$OUT"
rm -rf "$TMP"
echo "wrote $OUT"
