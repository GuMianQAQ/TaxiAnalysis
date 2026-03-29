#include "databasemanager.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QDebug>

DatabaseManager::DatabaseManager(const QString &dbName) {
    db = QSqlDatabase::addDatabase("QSQLITE");
    db.setDatabaseName(dbName);
}

DatabaseManager::~DatabaseManager() {
    if (db.isOpen()) {
        db.close();
    }
}

bool DatabaseManager::open() {
    if (!db.open()) {
        qDebug() << "数据库打开失败:" << db.lastError().text();
        return false;
    }

    QSqlQuery query;

    // 导入阶段的性能优化
    query.exec("PRAGMA synchronous = OFF");
    query.exec("PRAGMA journal_mode = MEMORY");

    if (!query.exec("CREATE TABLE IF NOT EXISTS taxi_points ("
                    "id INTEGER, "
                    "time INTEGER, "
                    "lon REAL, "
                    "lat REAL)")) {
        qDebug() << "建表失败:" << query.lastError().text();
        return false;
    }

    return true;
}

bool DatabaseManager::batchInsert(const std::vector<GPSPoint>& points) {
    if (points.empty()) {
        return true;
    }

    if (!db.transaction()) {
        qDebug() << "开启事务失败:" << db.lastError().text();
        return false;
    }

    QSqlQuery query;
    query.prepare("INSERT INTO taxi_points (id, time, lon, lat) VALUES (?, ?, ?, ?)");

    for (const auto& p : points) {
        query.addBindValue(p.id);
        query.addBindValue(static_cast<qlonglong>(p.timestamp));
        query.addBindValue(p.lon);
        query.addBindValue(p.lat);

        if (!query.exec()) {
            qDebug() << "插入失败:" << query.lastError().text();
            db.rollback();
            return false;
        }
    }

    if (!db.commit()) {
        qDebug() << "提交事务失败:" << db.lastError().text();
        return false;
    }

    return true;
}

qint64 DatabaseManager::getPointCount() {
    if (!db.isOpen()) {
        qDebug() << "数据库未打开，无法统计点数";
        return 0;
    }

    QSqlQuery query;
    if (!query.exec("SELECT COUNT(*) FROM taxi_points")) {
        qDebug() << "统计点数失败:" << query.lastError().text();
        return 0;
    }

    if (query.next()) {
        return query.value(0).toLongLong();
    }

    return 0;
}