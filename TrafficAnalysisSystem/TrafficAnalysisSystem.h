#ifndef TRAFFICANALYSISSYSTEM_H
#define TRAFFICANALYSISSYSTEM_H

#include <QMainWindow>
#include <QPushButton>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QWidget>
#include <QtWebEngineWidgets/QWebEngineView>

class TrafficAnalysisSystem : public QMainWindow
{
    Q_OBJECT

public:
    TrafficAnalysisSystem(QWidget *parent = nullptr);
    ~TrafficAnalysisSystem();

private:
    void loadMap();

private:
    QWidget *centralWidget;

    // 总布局：左边按钮，右边地图
    QHBoxLayout *mainLayout;

    // 左侧按钮区
    QWidget *buttonPanel;
    QVBoxLayout *buttonLayout;

    QPushButton *btn1;
    QPushButton *btn2;
    QPushButton *btn3;
    QPushButton *btn4;
    QPushButton *btn5;
    QPushButton *btn6;

    // 右侧地图区
    QWebEngineView *webView;
};

#endif // TRAFFICANALYSISSYSTEM_H