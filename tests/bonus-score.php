<?php
// Pure validation only: no HTTP, score files or live service.
define('DINO_HIGHSCORES', true);
require __DIR__ . '/../highscores-lib.php';

foreach (['normal', 'relaxed'] as $mode) {
    foreach ([1000, 11999, 12000, 12001, 17000, 29999, 30000, 30001, 47999, 48000, 48001, 60000, 3600000] as $duration) {
        $steps = (int) ceil($duration * 60 / 1000);
        $base = $steps * DINO_MAX_SPEED[$mode] * DINO_TURBO * DINO_POINTS_PER_PX;
        $expected = (int) floor($base * 1.1) + 1
            + ($duration < 12000 ? 0 : 25 * (1 + intdiv($duration - 12000, 18000)));
        if (dino_max_score($mode, $duration) !== $expected) {
            throw new RuntimeException('Bonus score bound mismatch');
        }
        $submission = ['v' => 1, 'mode' => $mode,
            'id' => '00000000-0000-4000-8000-000000000001', 'name' => 'DINO',
            'score' => $expected, 'durationMs' => $duration];
        dino_validate_submission($submission);
        $submission['score']++;
        try {
            dino_validate_submission($submission);
            throw new RuntimeException('Impossible score accepted');
        } catch (DinoHttpError $error) {
            if ($error->code_name !== 'implausible') {
                throw $error;
            }
        }
    }
}
echo "Bonus-inclusive validation accepts the bound and rejects bound+1 in both modes\n";
