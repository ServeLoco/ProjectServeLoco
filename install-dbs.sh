#!/bin/bash
# Install MySQL
echo 'jaat' | sudo -S apt update
echo 'jaat' | sudo -S DEBIAN_FRONTEND=noninteractive apt install mysql-server -y
echo 'jaat' | sudo -S systemctl start mysql
echo 'jaat' | sudo -S systemctl enable mysql

# Create MySQL Database and set root password to 'jaat' if it's not set
echo 'jaat' | sudo -S mysql -e "CREATE DATABASE IF NOT EXISTS serveloco;"
echo 'jaat' | sudo -S mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'jaat'; FLUSH PRIVILEGES;" || true

# Install MongoDB
echo 'jaat' | sudo -S apt-get install gnupg curl -y
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc > mongo.asc
echo 'jaat' | sudo -S gpg --batch --yes -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor < mongo.asc
rm mongo.asc
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo -S tee /etc/apt/sources.list.d/mongodb-org-7.0.list
echo 'jaat' | sudo -S apt-get update
echo 'jaat' | sudo -S DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb-org
echo 'jaat' | sudo -S systemctl start mongod
echo 'jaat' | sudo -S systemctl enable mongod
