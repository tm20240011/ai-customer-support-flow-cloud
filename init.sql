CREATE DATABASE IF NOT EXISTS support_app;

USE support_app;

CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    message TEXT,
    status VARCHAR(50),
    type VARCHAR(50),
    priority VARCHAR(50)
    );