-- Creates the yaci user and yaci_store database for YACI Store.
-- Executed once by postgres on first container start.
CREATE USER yaci WITH PASSWORD 'dbpass';
CREATE DATABASE yaci_store OWNER yaci;
