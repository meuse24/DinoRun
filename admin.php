<?php
/*
 * Dino Run highscore moderation, command line only:
 *   php admin.php list [normal|relaxed]
 *   php admin.php remove <id>
 *   php admin.php reset <normal|relaxed|all> [--yes]
 * Changes use the same lock and atomic replacement as the API and keep a timestamped backup
 * in <data_dir>/backups/. HTTP requests are refused.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('DINO_HIGHSCORES', true);
require __DIR__ . '/highscores-lib.php';

function admin_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function admin_backup(): string
{
    $file = dino_store_file();
    if (!is_file($file)) {
        return '';
    }
    $dir = dino_data_dir() . '/backups';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        admin_fail('Cannot create backup directory ' . $dir);
    }
    $target = $dir . '/highscores-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '.json';
    if (!@copy($file, $target)) {
        admin_fail('Backup failed; nothing was changed.');
    }
    return $target;
}

function admin_print(array $store, array $modes): void
{
    foreach ($modes as $mode) {
        echo strtoupper($mode) . "\n";
        if (!$store['lists'][$mode]) {
            echo "  (empty)\n";
        }
        foreach ($store['lists'][$mode] as $index => $entry) {
            printf("  %2d  %s  %10d  %s  %s\n", $index + 1, $entry['name'], $entry['score'], $entry['achievedAt'], $entry['id']);
        }
    }
}

$args = array_slice($argv, 1);
$command = $args[0] ?? '';
$modes = array_keys(DINO_MAX_SPEED);

try {
    if ($command === 'list') {
        $selected = isset($args[1]) ? [$args[1]] : $modes;
        foreach ($selected as $mode) {
            if (!dino_is_mode($mode)) {
                admin_fail('Unknown mode: ' . $mode);
            }
        }
        admin_print(dino_read_store(), $selected);
    } elseif ($command === 'remove') {
        $id = $args[1] ?? '';
        if (!dino_is_id($id)) {
            admin_fail('Usage: php admin.php remove <id>  (IDs are shown by "list")');
        }
        $removed = dino_locked(function () use ($id): ?array {
            $store = dino_read_store();
            foreach ($store['lists'] as $mode => $list) {
                foreach ($list as $index => $entry) {
                    if ($entry['id'] === $id) {
                        $backup = admin_backup();
                        array_splice($store['lists'][$mode], $index, 1);
                        dino_save_store($store);
                        return [$mode, $entry, $backup];
                    }
                }
            }
            return null;
        });
        if ($removed === null) {
            admin_fail('No entry with ID ' . $id);
        }
        [$mode, $entry, $backup] = $removed;
        printf("Removed %s %d from %s. Backup: %s\n", $entry['name'], $entry['score'], $mode, $backup);
    } elseif ($command === 'reset') {
        $target = $args[1] ?? '';
        if ($target !== 'all' && !dino_is_mode($target)) {
            admin_fail('Usage: php admin.php reset <normal|relaxed|all> [--yes]');
        }
        if (!in_array('--yes', $args, true)) {
            echo "Type RESET to clear the $target top 10: ";
            if (trim((string) fgets(STDIN)) !== 'RESET') {
                admin_fail('Cancelled.');
            }
        }
        $backup = dino_locked(function () use ($target, $modes): string {
            $store = dino_read_store();
            $backup = admin_backup();
            foreach ($target === 'all' ? $modes : [$target] as $mode) {
                $store['lists'][$mode] = [];
            }
            dino_save_store($store);
            return $backup;
        });
        echo "Reset $target. Backup: " . ($backup ?: '(no previous data)') . "\n";
    } else {
        admin_fail("Usage:\n  php admin.php list [normal|relaxed]\n  php admin.php remove <id>\n  php admin.php reset <normal|relaxed|all> [--yes]");
    }
} catch (DinoHttpError $error) {
    admin_fail($error->getMessage());
}
