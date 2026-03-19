#include "datamanager.h"
#include <QDirIterator>
#include <QFile>
#include <QTextStream>
#include <QDateTime>
#include <QDebug>

DataManager::DataManager() {}

void DataManager::loadTxtFiles(const QString &dirPath) {
    qDebug() << "正在扫描文件夹:" << dirPath << "(文件较多，请稍候...)";

    QDirIterator it(dirPath, QStringList() << "*.txt", QDir::Files, QDirIterator::Subdirectories);

    int fileCount = 0;
    // 在这里加一行，证明程序没死
    qDebug() << "开始解析文件内容...";
    
    while (it.hasNext()) {
        QFile file(it.next());
        if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QTextStream in(&file);
            while (!in.atEnd()) {
                QString line = in.readLine();
                QStringList parts = line.split(',');
                if (parts.size() < 4) continue;

                GPSPoint p;
                p.id = parts[0].toInt();
                p.timestamp = QDateTime::fromString(parts[1], "yyyy-MM-dd HH:mm:ss").toSecsSinceEpoch();
                p.lon = parts[2].toDouble();
                p.lat = parts[3].toDouble();

                // 粗略过滤北京范围
                if (p.lon > 115.0 && p.lon < 118.0 && p.lat > 39.0 && p.lat < 41.0) {
                    allPoints.push_back(p);
                }
            }
        }
        if (++fileCount % 500 == 0) {
            qDebug() << "已读取" << fileCount << "个文件...";
        }
    }
    qDebug() << "Successfully loaded points:" << allPoints.size();
}
