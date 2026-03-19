#ifndef DATAMANAGER_H
#define DATAMANAGER_H

#include <QString>
#include <vector>  // 用 std::vector

// 定义 GPS 点结构
struct GPSPoint {
    int id;
    long long timestamp;
    double lon;
    double lat;
};

class DataManager {
public:
    DataManager();
    // 只负责读数据到 allPoints 里
    void loadTxtFiles(const QString &dirPath);
    
    // 把这个数组暴露给四叉树使用
    const std::vector<GPSPoint>& getAllPoints() const { return allPoints; }

private:
    std::vector<GPSPoint> allPoints;
};

#endif