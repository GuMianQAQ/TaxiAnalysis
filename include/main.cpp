#include <QApplication>
#include <QDebug>
#include <QDirIterator>
#include <QElapsedTimer>
#include "TrafficAnalysisSystem/TrafficAnalysisSystem.h"
#include "include/databasemanager.h" // 确保路径正确

// 这是一个辅助函数，把你的导入逻辑挪到这里，避免 main 函数太乱
void checkAndImportData(DatabaseManager &dbm) {
    QString dataPath = "D:/Taxi-Analysis/data"; // 你的数据路径
    
    // 如果数据库里已经有数据了，就跳过导入（避免每次启动都重写 1600 万条）
    if (dbm.getPointCount() > 10000000) { 
        qDebug() << "检测到数据库已有数据，跳过导入。";
        return;
    }

    qDebug() << "--- 数据库为空，开始全量导入 1600 万数据 ---";
    QElapsedTimer timer; timer.start();

    QDirIterator it(dataPath, QStringList() << "*.txt", QDir::Files, QDirIterator::Subdirectories);
    std::vector<GPSPoint> buffer;
    int fileCount = 0;
    long long totalPoints = 0;

    while (it.hasNext()) {
        QString filePath = it.next();
        QFile file(filePath);
        if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QTextStream in(&file);
            while (!in.atEnd()) {
                QString line = in.readLine();
                QStringList parts = line.split(',');
                if (parts.size() < 4) continue;

                GPSPoint p;
                p.id = parts[0].toInt();
                p.lon = parts[2].toDouble();
                p.lat = parts[3].toDouble();

                // 北京范围过滤
                if (p.lon > 115.0 && p.lon < 118.0 && p.lat > 39.0 && p.lat < 41.0) {
                    buffer.push_back(p);
                }
            }
            file.close();
        }

        if (++fileCount % 500 == 0) {
            dbm.batchInsert(buffer);
            totalPoints += buffer.size();
            qDebug() << "进度:" << fileCount << "文件 | 已存入:" << totalPoints/10000 << "万点";
            buffer.clear();
        }
    }
    dbm.batchInsert(buffer); 
    qDebug() << "导入完成！总点数:" << totalPoints + buffer.size() << " 耗时:" << timer.elapsed()/1000 << "s";
}

int main(int argc, char *argv[])
{
    // 1. 初始化应用（如果是 GUI 项目，必须用 QApplication）
    QApplication app(argc, argv);
    
    // 2. 初始化数据库
    DatabaseManager dbm("taxi_data.db");
    if (!dbm.open()) {
        qDebug() << "数据库连接失败！请检查驱动。";
        return -1;
    }

    // 3. 执行导入逻辑（可选：你可以注释掉这一行，如果数据库已经做好了）
    // checkAndImportData(dbm);

    // 4. 启动组员写的界面
    TrafficAnalysisSystem window;
    window.show();
    
    return app.exec();
}
