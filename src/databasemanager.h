#ifndef DATABASEMANAGER_H
#define DATABASEMANAGER_H

#include <QSqlDatabase>
#include <QString>
#include <vector>
#include "datamanager.h" 

class DatabaseManager {
public:
    DatabaseManager(const QString &dbName = "taxi_data.db");
    ~DatabaseManager();

    bool open();
    // 核心：批量插入内存中的数据
    bool batchInsert(const std::vector<GPSPoint>& points);

private:
    QSqlDatabase db;
};

#endif