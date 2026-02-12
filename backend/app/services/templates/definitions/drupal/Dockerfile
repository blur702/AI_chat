FROM php:8.3-apache

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    unzip \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    libicu-dev \
    default-mysql-client \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        gd \
        opcache \
        pdo_mysql \
        zip \
        intl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Configure Apache to listen on unprivileged port 8080
RUN a2enmod rewrite
ENV APACHE_DOCUMENT_ROOT=/workspace/web
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
    /etc/apache2/sites-available/*.conf \
    /etc/apache2/apache2.conf \
    /etc/apache2/conf-available/*.conf \
    && sed -ri -e 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf \
    && sed -ri -e 's/:80>/:8080>/' /etc/apache2/sites-available/*.conf

# Set recommended PHP settings for Drupal
RUN { \
    echo 'memory_limit = 256M'; \
    echo 'upload_max_filesize = 64M'; \
    echo 'post_max_size = 64M'; \
    echo 'max_execution_time = 300'; \
    echo 'opcache.enable = 1'; \
    echo 'opcache.memory_consumption = 128'; \
    } > /usr/local/etc/php/conf.d/drupal.ini

# Create non-root user and set permissions
RUN groupadd -r wwwuser && useradd -r -g wwwuser -d /workspace wwwuser \
    && mkdir -p /workspace/web \
    && chown -R wwwuser:wwwuser /workspace \
    && chown -R wwwuser:wwwuser /var/run/apache2 \
    && chown -R wwwuser:wwwuser /var/log/apache2 \
    && chown -R wwwuser:wwwuser /var/lock/apache2 || true

WORKDIR /workspace

USER wwwuser

EXPOSE 8080
