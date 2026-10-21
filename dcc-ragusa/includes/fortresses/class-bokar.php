<?php
namespace DCCR\Fortress;

use DCCR\Alerts;
use DCCR\Events;
use DCCR\Fortress;
use DCCR\State;
use DCCR\Vault;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Bokar · Guards The Login. A snapshot of administrators and editors every
 * tick, and a record of administrator logins from the login page only. It
 * records and reports; Jetpack Protect does the blocking. Alerts name the
 * login only for administrators; IPs are a salted hash plus a truncated
 * display form, kept 90 days.
 */
final class Bokar
{
    public const WATCHED_ROLES = ['administrator', 'editor'];
    public const LOGINS_OPTION = 'dcc_ragusa_logins';
    public const KEEP_DAYS     = 90;
    public const MAX_IPS       = 50;

    /** @return array{users:array<int,array{role:string,login:string,app:int}>,total:int} */
    public static function snapshot(): array
    {
        $users = [];
        foreach (get_users(['role__in' => self::WATCHED_ROLES, 'fields' => 'all', 'number' => 200]) as $u) {
            $roles = (array) ($u->roles ?? []);
            $role  = in_array('administrator', $roles, true) ? 'administrator' : 'editor';
            $app   = 0;
            if (class_exists('WP_Application_Passwords')) {
                $app = count((array) \WP_Application_Passwords::get_user_application_passwords((int) $u->ID));
            }
            $users[(int) $u->ID] = ['role' => $role, 'login' => $role === 'administrator' ? (string) $u->user_login : '', 'app' => $app];
        }
        ksort($users);
        $counts = function_exists('count_users') ? count_users() : ['total_users' => count($users)];
        return ['users' => $users, 'total' => (int) ($counts['total_users'] ?? 0)];
    }

    private static function describe(int $id, array $u): string
    {
        return $u['role'] === 'administrator' && $u['login'] !== ''
            /* translators: 1: login, 2: id */
            ? sprintf(__('administrator "%1$s" (user %2$d)', 'dcc-ragusa'), $u['login'], $id)
            /* translators: 1: role, 2: id */
            : sprintf(__('%1$s user %2$d', 'dcc-ragusa'), $u['role'], $id);
    }

    /** Every tick: diff against the baseline, report each change once, then accept it. */
    public static function tick(): string
    {
        $b     = get_option('dcc_ragusa_baselines', []);
        $b     = is_array($b) ? $b : [];
        $now   = self::snapshot();
        $seen  = $b['users'] ?? null;
        $lines = [];
        if ($seen === null) {
            $b['users'] = $now;
            self::save($b);
            $admins = count(array_filter($now['users'], static fn($u) => $u['role'] === 'administrator'));
            Events::record(Fortress::BOKAR, Events::INFO, 'baselined', 'users', sprintf(
                /* translators: 1: users, 2: admins */
                __('Baseline taken: %1$d users, %2$d administrators.', 'dcc-ragusa'),
                $now['total'],
                $admins
            ));
            self::update_status($now, 0);
            return __('Bokar baselined the users.', 'dcc-ragusa');
        }
        $changes = 0;
        foreach ($now['users'] as $id => $u) {
            $old = $seen['users'][$id] ?? null;
            if ($old === null) {
                $changes++;
                self::alert(
                    $u['role'] === 'administrator' ? Events::BREACHED : Events::NEEDS_LOOK,
                    'user-new',
                    (string) $id,
                    $u['role'] === 'administrator' ? __('New Administrator', 'dcc-ragusa') : __('New Editor', 'dcc-ragusa'),
                    /* translators: %s: user description */
                    sprintf(__('A new %s appeared.', 'dcc-ragusa'), self::describe($id, $u)),
                    $u['role'] === 'administrator'
                        ? __('If you did not create this account, remove it now from Users and change every administrator password.', 'dcc-ragusa')
                        : __('If you did not create this account, remove it from Users.', 'dcc-ragusa')
                );
                continue;
            }
            if ($old['role'] !== $u['role']) {
                $changes++;
                self::alert(Events::BREACHED, 'role-changed', (string) $id, __('Role Changed', 'dcc-ragusa'),
                    /* translators: 1: user, 2: old role, 3: new role */
                    sprintf(__('%1$s changed from %2$s to %3$s.', 'dcc-ragusa'), self::describe($id, $u), $old['role'], $u['role']),
                    __('If you did not change this role, set it back from Users and change the administrator passwords.', 'dcc-ragusa'));
            }
            if ((int) $u['app'] > (int) $old['app']) {
                $changes++;
                self::alert(Events::NEEDS_LOOK, 'app-password', (string) $id . '@' . time(), __('Application Password Created', 'dcc-ragusa'),
                    /* translators: 1: user, 2: count */
                    sprintf(__('%1$s now has %2$d application passwords.', 'dcc-ragusa'), self::describe($id, $u), (int) $u['app']),
                    __('If you did not create it (Jetpack and some apps do), open Users → the account → Application Passwords and revoke it.', 'dcc-ragusa'));
            }
        }
        foreach ($seen['users'] as $id => $old) {
            if (!isset($now['users'][$id])) {
                $changes++;
                self::alert(Events::NEEDS_LOOK, 'user-gone', (string) $id, __('Privileged Account Removed Or Demoted', 'dcc-ragusa'),
                    /* translators: %s: user */
                    sprintf(__('%s is no longer an administrator or editor.', 'dcc-ragusa'), self::describe((int) $id, $old)),
                    __('If you did not do this, ask the site director.', 'dcc-ragusa'));
            }
        }
        if ($changes > 0 || $now !== $seen) {
            $b['users'] = $now;
            self::save($b);
        }
        self::update_status($now, $changes);
        return $changes === 0 ? __('Bokar: no change.', 'dcc-ragusa') : sprintf(_n('Bokar: %d change.', 'Bokar: %d changes.', $changes, 'dcc-ragusa'), $changes);
    }

    private static function alert(string $severity, string $kind, string $target, string $title, string $what, string $todo): void
    {
        Events::record(Fortress::BOKAR, $severity, $kind, $target, $what);
        Alerts::raise([
            'fortress' => Fortress::BOKAR,
            'severity' => $severity,
            'kind'     => $kind,
            'target'   => $target,
            'title'    => $title,
            'what'     => $what,
            'did'      => __('Ragusa recorded it and changed nothing: accounts are never edited on its own.', 'dcc-ragusa'),
            'todo'     => $todo,
        ]);
    }

    private static function save(array $b): void
    {
        if (get_option('dcc_ragusa_baselines', null) === null) {
            add_option('dcc_ragusa_baselines', $b, '', 'no');
        } else {
            update_option('dcc_ragusa_baselines', $b, 'no');
        }
    }

    private static function update_status(array $now, int $changes): void
    {
        $admins = count(array_filter($now['users'], static fn($u) => $u['role'] === 'administrator'));
        $recent = Events::count_since(Fortress::BOKAR, time() - 7 * 86400) - Events::count_since(Fortress::BOKAR, time() - 7 * 86400, Events::INFO);
        $line   = $recent === 0
            /* translators: %d: administrators */
            ? sprintf(_n('%d Administrator, No Changes', '%d Administrators, No Changes', $admins, 'dcc-ragusa'), $admins)
            /* translators: 1: administrators, 2: changes */
            : sprintf(_n('%1$d Administrators, %2$d Change In 7 Days', '%1$d Administrators, %2$d Changes In 7 Days', $recent, 'dcc-ragusa'), $admins, $recent);
        Fortress::set_status(Fortress::BOKAR, Alerts::worst(Fortress::BOKAR), $line);
    }

    // --------------------------------------------------------------- login

    public static function hash_ip(string $ip): string
    {
        return substr(hash_hmac('sha256', $ip, Vault::key()), 0, 32);
    }

    /** 203.0.113.x, or the first four groups of an IPv6 address. */
    public static function display_ip(string $ip): string
    {
        if (str_contains($ip, ':')) {
            $parts = explode(':', $ip);
            return implode(':', array_slice($parts, 0, 4)) . '::x';
        }
        $parts = explode('.', $ip);
        if (count($parts) === 4) {
            $parts[3] = 'x';
            return implode('.', $parts);
        }
        return 'unknown';
    }

    public static function on_login(string $login, $user): void
    {
        try {
            if (!is_object($user) || !in_array('administrator', (array) ($user->roles ?? []), true)) {
                return;
            }
            $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
            if ($ip === '') {
                return;
            }
            $id      = (int) $user->ID;
            $hash    = self::hash_ip($ip);
            $logins  = get_option(self::LOGINS_OPTION, []);
            $logins  = is_array($logins) ? $logins : [];
            $now     = time();
            $cut     = $now - self::KEEP_DAYS * 86400;
            foreach ($logins as $uid => $ips) {
                foreach ((array) $ips as $h => $rec) {
                    if ((int) ($rec['last'] ?? 0) < $cut) {
                        unset($logins[$uid][$h]);
                    }
                }
                if ($logins[$uid] === []) {
                    unset($logins[$uid]);
                }
            }
            $known = isset($logins[$id][$hash]);
            $first = empty($logins[$id]);
            $logins[$id][$hash] = ['first' => $known ? (int) $logins[$id][$hash]['first'] : $now, 'last' => $now, 'disp' => self::display_ip($ip)];
            if (count($logins[$id]) > self::MAX_IPS) {
                uasort($logins[$id], static fn($a, $b) => ($b['last'] ?? 0) <=> ($a['last'] ?? 0));
                $logins[$id] = array_slice($logins[$id], 0, self::MAX_IPS, true);
            }
            if (get_option(self::LOGINS_OPTION, null) === null) {
                add_option(self::LOGINS_OPTION, $logins, '', 'no');
            } else {
                update_option(self::LOGINS_OPTION, $logins, 'no');
            }
            if ($known) {
                return;
            }
            Events::record(Fortress::BOKAR, $first ? Events::INFO : Events::NEEDS_LOOK, 'login-new-ip', (string) $id, sprintf(
                /* translators: 1: login, 2: masked ip */
                __('Administrator "%1$s" logged in from a new address (%2$s).', 'dcc-ragusa'),
                $login,
                self::display_ip($ip)
            ));
            if ($first) {
                return; // The first address ever seen for this account is the baseline.
            }
            Alerts::raise([
                'fortress' => Fortress::BOKAR,
                'severity' => Events::NEEDS_LOOK,
                'kind'     => 'login-new-ip',
                'target'   => $id . '@' . $hash,
                'title'    => __('Administrator Login From A New Address', 'dcc-ragusa'),
                /* translators: 1: login, 2: masked ip */
                'what'     => sprintf(__('Administrator "%1$s" logged in from an address Ragusa had not seen before (%2$s).', 'dcc-ragusa'), $login, self::display_ip($ip)),
                'did'      => __('Ragusa recorded it. It does not block logins; Jetpack Protect does.', 'dcc-ragusa'),
                'todo'     => __('If this was you on a new connection, nothing to do. If not, change this password now.', 'dcc-ragusa'),
            ]);
            State::flush();
        } catch (\Throwable $e) {
            // Never break a login.
        }
    }
}
