<?php
// Copy to highscores.config.php and adapt on the server. Never commit that file.
return [
    // Use an absolute directory OUTSIDE the actual web document root.
    // Preserve the existing data_dir if this installation already has scores.
    'data_dir' => '/home/DEIN_BENUTZER/private/dino-highscores',
    // Paste only the hash printed by: php admin.php create-password
    // Empty means the web console stays disabled (HTTP 404).
    'admin_password_hash' => '',
    // Never enable this on a public server. Only applies to loopback php -S.
    'admin_allow_local_http' => false,
];
