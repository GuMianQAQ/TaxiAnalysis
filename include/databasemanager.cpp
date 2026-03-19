#include "databasemanager.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QDebug>

DatabaseManager::DatabaseManager(const QString &dbName) {
    db = QSqlDatabase::addDatabase("QSQLITE");
    db.setDatabaseName(dbName);
}

DatabaseManager::~DatabaseManager() {
    if (db.isOpen()) db.close();
}

bool DatabaseManager::open() {
    if (!db.open()) return false;
    QSqlQuery query;
    // 性能开关：全速模式
    query.exec("PRAGMA synchronous = OFF");
    query.exec("PRAGMA journal_mode = MEMORY");
    // 创建表结构
    return query.exec("CREATE TABLE IF NOT EXISTS taxi_points ("
                      "id INTEGER, time INTEGER, lon REAL, lat REAL)");
}

bool DatabaseManager::batchInsert(const std::vector<GPSPoint>& points) {
    if (points.empty()) return true;
    db.transaction(); // 开启事务：极速写入的关键
    QSqlQuery query;
    query.prepare("INSERT INTO taxi_points (id, time, lon, lat) VALUES (?, ?, ?, ?)");
    for (const auto& p : points) {
        query.addBindValue(p.id);
        query.addBindValue((qlonglong)p.timestamp);
        query.addBindValue(p.lon);
        query.addBindValue(p.lat);
        query.exec();
    }
    return db.commit(); // 提交事务：一次性写入硬盘
}