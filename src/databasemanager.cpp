#include "databasemanager.h"

#include <algorithm>
#include <QDebug>
#include <QSqlError>
#include <QSqlQuery>
#include <QVariant>

DatabaseManager::DatabaseManager(const QString &dbName, const QString &connectionName)
    : connectionName(connectionName.isEmpty() ? QStringLiteral("TaxiDataAnalysisConnection")
                                              : connectionName) {
    if (QSqlDatabase::contains(this->connectionName)) {
        db = QSqlDatabase::database(this->connectionName);
    } else {
        db = QSqlDatabase::addDatabase("QSQLITE", this->connectionName);
    }
    db.setDatabaseName(dbName);
}

DatabaseManager::~DatabaseManager() {
    if (db.isOpen()) {
        db.close();
    }

    const QString name = connectionName;
    db = QSqlDatabase();
    if (!name.isEmpty() && QSqlDatabase::contains(name)) {
        QSqlDatabase::removeDatabase(name);
    }
}

bool DatabaseManager::open() {
    if (!db.open()) {
        qDebug() << "Failed to open database:" << db.lastError().text();
        return false;
    }

    QSqlQuery query(db);

    query.exec("PRAGMA synchronous = OFF");
    query.exec("PRAGMA journal_mode = MEMORY");

    if (!query.exec("CREATE TABLE IF NOT EXISTS taxi_points ("
                    "id INTEGER, "
                    "time INTEGER, "
                    "lon REAL, "
                    "lat REAL)")) {
        qDebug() << "Failed to create taxi_points table:" << query.lastError().text();
        return false;
    }

    if (!query.exec("CREATE INDEX IF NOT EXISTS idx_taxi_points_id_time "
                    "ON taxi_points(id, time)")) {
        qDebug() << "Failed to create idx_taxi_points_id_time:" << query.lastError().text();
    }

    return true;
}

bool DatabaseManager::batchInsert(const std::vector<GPSPoint>& points) {
    if (points.empty()) {
        return true;
    }

    if (!db.transaction()) {
        qDebug() << "Failed to start transaction:" << db.lastError().text();
        return false;
    }

    QSqlQuery query(db);
    query.prepare("INSERT INTO taxi_points (id, time, lon, lat) VALUES (?, ?, ?, ?)");

    for (const auto& p : points) {
        query.addBindValue(p.id);
        query.addBindValue(static_cast<qlonglong>(p.timestamp));
        query.addBindValue(p.lon);
        query.addBindValue(p.lat);

        if (!query.exec()) {
            qDebug() << "Failed to insert point:" << query.lastError().text();
            db.rollback();
            return false;
        }
    }

    if (!db.commit()) {
        qDebug() << "Failed to commit transaction:" << db.lastError().text();
        return false;
    }

    return true;
}

qint64 DatabaseManager::getPointCount() {
    if (!db.isOpen()) {
        qDebug() << "Database is not open, cannot count points.";
        return 0;
    }

    QSqlQuery query(db);
    if (!query.exec("SELECT COUNT(*) FROM taxi_points")) {
        qDebug() << "Failed to count points:" << query.lastError().text();
        return 0;
    }

    if (query.next()) {
        return query.value(0).toLongLong();
    }

    return 0;
}

std::vector<GPSPoint> DatabaseManager::getTrajectoryByTaxiId(int taxiId) {
    std::vector<GPSPoint> points;

    if (!db.isOpen()) {
        qDebug() << "Database is not open, cannot query trajectory.";
        return points;
    }

    QSqlQuery query(db);
    query.prepare("SELECT id, time, lon, lat "
                  "FROM taxi_points "
                  "WHERE id = ? "
                  "ORDER BY time ASC");
    query.addBindValue(taxiId);

    if (!query.exec()) {
        qDebug() << "Failed to query trajectory:" << query.lastError().text();
        return points;
    }

    while (query.next()) {
        GPSPoint point;
        point.id = query.value(0).toInt();
        point.timestamp = query.value(1).toLongLong();
        point.lon = query.value(2).toDouble();
        point.lat = query.value(3).toDouble();
        points.push_back(point);
    }

    return points;
}

std::vector<GPSPoint> DatabaseManager::getAllPointsForDisplay(int maxPoints) {
    std::vector<GPSPoint> points;

    if (!db.isOpen()) {
        qDebug() << "Database is not open, cannot query all points.";
        return points;
    }

    if (maxPoints <= 0) {
        return points;
    }

    const qint64 totalCount = getPointCount();
    if (totalCount <= 0) {
        return points;
    }

    const qint64 step = std::max<qint64>(1, (totalCount + maxPoints - 1) / maxPoints);

    QSqlQuery query(db);
    query.prepare("SELECT id, time, lon, lat "
                  "FROM taxi_points "
                  "WHERE (? = 1 OR rowid % ? = 0) "
                  "LIMIT ?");
    query.addBindValue(step);
    query.addBindValue(step);
    query.addBindValue(maxPoints);

    if (!query.exec()) {
        qDebug() << "Failed to query all points for display:" << query.lastError().text();
        return points;
    }

    points.reserve(maxPoints);
    while (query.next()) {
        GPSPoint point;
        point.id = query.value(0).toInt();
        point.timestamp = query.value(1).toLongLong();
        point.lon = query.value(2).toDouble();
        point.lat = query.value(3).toDouble();
        points.push_back(point);
    }

    return points;
}

qint64 DatabaseManager::countUniqueTaxisInBoundsAndTime(qint64 startTime,
                                                        qint64 endTime,
                                                        double minLon,
                                                        double minLat,
                                                        double maxLon,
                                                        double maxLat) {
    if (!db.isOpen()) {
        qDebug() << "Database is not open, cannot count taxis in bounds.";
        return -1;
    }

    qint64 datasetMinTime = 0;
    qint64 datasetMaxTime = 0;
    double datasetMinLon = 0.0;
    double datasetMinLat = 0.0;
    double datasetMaxLon = 0.0;
    double datasetMaxLat = 0.0;
    const bool hasValidBounds = getDatasetBounds(datasetMinTime, datasetMaxTime,
                                                 datasetMinLon, datasetMinLat,
                                                 datasetMaxLon, datasetMaxLat);
    const qint64 reasonableEpochStart = 946684800; // 2000-01-01 00:00:00
    const bool timeRangeLooksInvalid =
        !hasValidBounds || datasetMaxTime < reasonableEpochStart || datasetMinTime > datasetMaxTime;

    QSqlQuery query(db);
    if (timeRangeLooksInvalid) {
        query.prepare("SELECT COUNT(DISTINCT id) "
                      "FROM taxi_points "
                      "WHERE lon >= ? AND lon <= ? "
                      "AND lat >= ? AND lat <= ?");
        query.addBindValue(minLon);
        query.addBindValue(maxLon);
        query.addBindValue(minLat);
        query.addBindValue(maxLat);
    } else {
        query.prepare("SELECT COUNT(DISTINCT id) "
                      "FROM taxi_points "
                      "WHERE time >= ? AND time <= ? "
                      "AND lon >= ? AND lon <= ? "
                      "AND lat >= ? AND lat <= ?");
        query.addBindValue(startTime);
        query.addBindValue(endTime);
        query.addBindValue(minLon);
        query.addBindValue(maxLon);
        query.addBindValue(minLat);
        query.addBindValue(maxLat);
    }

    if (!query.exec()) {
        qDebug() << "Failed to count taxis in bounds:" << query.lastError().text();
        return -1;
    }

    if (query.next()) {
        return query.value(0).toLongLong();
    }

    return 0;
}

bool DatabaseManager::getDatasetBounds(qint64 &minTime,
                                       qint64 &maxTime,
                                       double &minLon,
                                       double &minLat,
                                       double &maxLon,
                                       double &maxLat) {
    if (!db.isOpen()) {
        qDebug() << "Database is not open, cannot get dataset bounds.";
        return false;
    }

    QSqlQuery query(db);
    if (!query.exec("SELECT MIN(time), MAX(time), MIN(lon), MIN(lat), MAX(lon), MAX(lat) "
                    "FROM taxi_points")) {
        qDebug() << "Failed to query dataset bounds:" << query.lastError().text();
        return false;
    }

    if (!query.next() || query.isNull(0) || query.isNull(1)) {
        return false;
    }

    minTime = query.value(0).toLongLong();
    maxTime = query.value(1).toLongLong();
    minLon = query.value(2).toDouble();
    minLat = query.value(3).toDouble();
    maxLon = query.value(4).toDouble();
    maxLat = query.value(5).toDouble();
    return true;
}
