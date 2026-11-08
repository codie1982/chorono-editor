"""Bounded macOS process telemetry for local performance evidence.

Reads numeric CPU-time/RSS and executable basenames only; never argv, environment,
URLs or browser state. CPU percentages use successive cumulative-time deltas and
are relative to one logical core. RSS belongs to an OS process, not automatically
to a scene/tab. A separate native Task Manager receipt must establish attribution.
The incremental JSONL survives interruption. No process or system setting changes.
"""
import argparse
import json
import subprocess
import time
from pathlib import Path


def seconds(value):
    """Parse ps cumulative [[days-]hours:]minutes:seconds into seconds."""
    days, _, rest = value.rpartition('-')
    fields = [float(part) for part in (rest if days else value).split(':')]
    result = 0.0
    for part in fields:
        result = result * 60 + part
    return result + (int(days) * 86400 if days else 0)


def read_processes():
    """Return current PID-keyed numeric data; ps failure remains a real error."""
    output = subprocess.run(['/bin/ps', '-A', '-o', 'pid=,rss=,time=,comm='],
                            check=True, capture_output=True, text=True).stdout
    rows = {}
    for line in output.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) == 4:
            pid, rss, cpu_time, executable = parts
            rows[int(pid)] = {'pid': int(pid), 'rssBytes': int(rss) * 1024,
                              'cpuSeconds': seconds(cpu_time),
                              'executable': Path(executable).name}
    return rows


def main():
    """Sample at a bounded interval, retaining Chrome/node rows plus top CPU deltas."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--seconds', type=int, default=900)
    parser.add_argument('--interval', type=int, default=15)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 3600 or not 1 <= args.interval <= 60:
        parser.error('seconds must be 1–3600 and interval 1–60')
    start = previous_at = time.monotonic()
    previous = read_processes()
    print(json.dumps({'state': 'sampling', 'output': str(args.output)}), flush=True)
    with args.output.open('x') as output:
        try:
            while time.monotonic() - start < args.seconds:
                time.sleep(min(args.interval, args.seconds - (time.monotonic() - start)))
                now = time.monotonic()
                current = read_processes()
                rows = []
                for pid, row in current.items():
                    old = previous.get(pid)
                    row['cpuPercentOneCore'] = (100 * max(0, row['cpuSeconds'] - old['cpuSeconds']) /
                                               (now - previous_at)) if old else None
                    rows.append(row)
                top = sorted((row for row in rows if row['cpuPercentOneCore'] is not None),
                             key=lambda row: row['cpuPercentOneCore'], reverse=True)[:8]
                browsers = [row for row in rows if row['executable'].startswith('Google Chrome')
                            or row['executable'] == 'node']
                output.write(json.dumps({'atUnixSeconds': time.time(), 'elapsedSeconds': now - start,
                                         'intervalSeconds': now - previous_at,
                                         'topCpu': top, 'browserAndNode': browsers}) + '\n')
                output.flush()
                previous, previous_at = current, now
        except KeyboardInterrupt:
            pass
    print(json.dumps({'state': 'stopped', 'elapsedSeconds': time.monotonic() - start}), flush=True)


if __name__ == '__main__':
    main()
