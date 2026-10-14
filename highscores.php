<?php
/*
 * Dino Run highscore API, v1. Lives next to dino.html.
 *   GET  highscores.php?v=1&mode=normal|relaxed   -> current top 10
 *   POST highscores.php  {"v":1,"id","mode","name","score","durationMs"} as text/plain JSON
 * See README.md (Highscores) for deployment, configuration and moderation.
 */
declare(strict_types=1);

define('DINO_HIGHSCORES', true);
require __DIR__ . '/highscores-lib.php';

dino_api_main();
