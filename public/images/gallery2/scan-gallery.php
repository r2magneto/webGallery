<?php
/**
 * Scannt diesen Ordner (Bilder + manifest.json) und schreibt manifest.json neu.
 * Auf dem Live-Server (All-Inkl) pro Galerie neben die Bilder legen (gallery1 / gallery2).
 */

declare(strict_types=1);

const MANIFEST_FILE = 'manifest.json';
const SCAN_SCRIPT = 'scan-gallery.php';

/** Zusätzliche erlaubte Origins (z. B. Produktions-Domain). */
const EXTRA_ALLOWED_ORIGINS = [
    // 'https://www.example.de',
];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function sendCorsHeaders(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allow = false;

    if ($origin !== '') {
        if (in_array($origin, EXTRA_ALLOWED_ORIGINS, true)) {
            $allow = true;
        } elseif (preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
            $allow = true;
        } else {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? '';
            if ($host !== '' && $origin === $scheme . '://' . $host) {
                $allow = true;
            }
        }
    }

    if ($allow && $origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Max-Age: 86400');
}

function isImageFile(string $name): bool
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    return in_array($ext, IMAGE_EXTENSIONS, true);
}

function shouldSkip(string $name): bool
{
    if ($name === '' || $name[0] === '.') {
        return true;
    }
    $lower = strtolower($name);
    if ($lower === MANIFEST_FILE || $lower === SCAN_SCRIPT) {
        return true;
    }
    return !isImageFile($name);
}

function scanFilenames(string $dir): array
{
    $entries = @scandir($dir);
    if ($entries === false) {
        return [];
    }

    $files = [];
    foreach ($entries as $name) {
        if (shouldSkip($name)) {
            continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $name;
        if (is_file($full)) {
            $files[] = $name;
        }
    }

    usort($files, static function (string $a, string $b): int {
        return strnatcasecmp($a, $b);
    });

    return $files;
}

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

sendCorsHeaders();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$dir = __DIR__;
$filenames = scanFilenames($dir);
$manifestPath = $dir . DIRECTORY_SEPARATOR . MANIFEST_FILE;
$payload = ['filenames' => $filenames];
$json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$json .= "\n";

if (@file_put_contents($manifestPath, $json, LOCK_EX) === false) {
    jsonResponse(500, [
        'ok' => false,
        'error' => 'manifest.json konnte nicht geschrieben werden.',
    ]);
}

jsonResponse(200, [
    'ok' => true,
    'count' => count($filenames),
    'filenames' => $filenames,
    'manifest' => MANIFEST_FILE,
]);
