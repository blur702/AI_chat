#!/bin/sh
set -eu

esc_user=$(printf "%s" "${MYSQL_HEALTHCHECK_USER}" | sed "s/'/''/g")
esc_pass=$(printf "%s" "${MYSQL_HEALTHCHECK_PASSWORD}" | sed "s/'/''/g")

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${esc_user}'@'localhost' IDENTIFIED BY '${esc_pass}';
GRANT USAGE ON *.* TO '${esc_user}'@'localhost';
FLUSH PRIVILEGES;
SQL
