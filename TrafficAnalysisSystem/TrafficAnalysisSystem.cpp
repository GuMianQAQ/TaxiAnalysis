#include "TrafficAnalysisSystem.h"

#include <QFileInfo>
#include <QUrl>
#include <QDebug>
#include <QCoreApplication>
#include <QWebEngineSettings>
#include<Qdir>
#include "appconfig.h"

TrafficAnalysisSystem::TrafficAnalysisSystem(QWidget *parent)
    : QMainWindow(parent)
{
    setWindowTitle("交通分析系统");
    resize(1400, 800);

    centralWidget = new QWidget(this);
    setCentralWidget(centralWidget);

    // 主布局：左边按钮区，右边地图区
    mainLayout = new QHBoxLayout(centralWidget);
    mainLayout->setContentsMargins(10, 10, 10, 10);
    mainLayout->setSpacing(10);

    // =========================
    // 左边：原来的按钮区
    // =========================
    buttonPanel = new QWidget(centralWidget);
    buttonPanel->setFixedWidth(220);

    buttonLayout = new QVBoxLayout(buttonPanel);
    buttonLayout->setSpacing(10);
    buttonLayout->setContentsMargins(20, 20, 20, 20);

    btn1 = new QPushButton("查询轨迹", buttonPanel);
    btn2 = new QPushButton("区域查找", buttonPanel);
    btn3 = new QPushButton("车辆密度", buttonPanel);
    btn4 = new QPushButton("区域关联分析", buttonPanel);
    btn5 = new QPushButton("频繁路径分析", buttonPanel);
    btn6 = new QPushButton("通行时间分析", buttonPanel);

    buttonLayout->addWidget(btn1);
    buttonLayout->addWidget(btn2);
    buttonLayout->addWidget(btn3);
    buttonLayout->addWidget(btn4);
    buttonLayout->addWidget(btn5);
    buttonLayout->addWidget(btn6);
    buttonLayout->addStretch();

    // =========================
    // 右边：地图区
    // =========================
    webView = new QWebEngineView(centralWidget);

    // 允许本地 html 访问远程资源（比如百度地图 JS）
    QWebEngineSettings *settings = webView->settings();
    settings->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);

    // 加入主布局
    mainLayout->addWidget(buttonPanel);
    mainLayout->addWidget(webView, 1);

    // 加载地图
    loadMap();
}

TrafficAnalysisSystem::~TrafficAnalysisSystem()
{
}

void TrafficAnalysisSystem::loadMap()
{
    QString configPath = QDir::currentPath() + "/config.ini";
    AppConfig config = AppConfig::load(configPath);
    QString htmlPath = config.mapPath;
    QFileInfo fileInfo(htmlPath);

    if (!fileInfo.exists()) {
        qDebug() << "map.html 不存在:" << htmlPath;
        return;
    }

    QUrl url = QUrl::fromLocalFile(fileInfo.absoluteFilePath());
    webView->load(url);

    qDebug() << "地图页面加载路径:" << url.toString();
}

