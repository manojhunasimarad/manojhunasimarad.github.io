"""Run every bundled reference solution and ensure each starter fails at least one test."""
import concurrent.futures
import json
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'py'))
import runner

def check(ex):
    tests = ex['tests']
    solved = runner.run_tests(ex['solution'], tests, given=ex.get('given', ''))
    starter = runner.run_tests(ex['starter'], tests[:1], given=ex.get('given', ''))
    # Check the remaining tests if the starter happens to satisfy the first example.
    if all(r['ok'] for r in starter):
        starter += runner.run_tests(ex['starter'], tests[1:], given=ex.get('given', ''))
    return {'id': ex['id'], 'reference_passed': sum(r['ok'] for r in solved), 'tests': len(tests),
            'starter_rejected': not all(r['ok'] for r in starter),
            'failures': [r for r in solved if not r['ok']]}

if __name__ == '__main__':
    exercises = json.loads((ROOT / 'content/exercises.json').read_text(encoding='utf-8'))['exercises']
    started = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(check, exercises))
    report = {'exercises': len(results), 'tests': sum(r['tests'] for r in results),
              'passed': sum(r['reference_passed'] for r in results),
              'starters_rejected': sum(r['starter_rejected'] for r in results),
              'seconds': round(time.time() - started, 1), 'results': results}
    (ROOT / 'EXERCISE-AUDIT.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'results'}))
    for r in results:
        if r['failures'] or not r['starter_rejected']:
            print(json.dumps(r))
    sys.exit(0 if report['passed'] == report['tests'] and report['starters_rejected'] == len(results) else 1)
