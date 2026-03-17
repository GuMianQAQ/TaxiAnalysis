#ifndef TRAFFICANALYSISSYSTEM_H
#define TRAFFICANALYSISSYSTEM_H

#include <QMainWindow>
#include <QPushButton>
#include <QVBoxLayout>
#include <QWidget>

class TrafficAnalysisSystem : public QMainWindow
{
    Q_OBJECT

public:
    TrafficAnalysisSystem(QWidget *parent = nullptr);
    ~TrafficAnalysisSystem();

private:
    QWidget *centralWidget;
    QVBoxLayout *layout;
    QPushButton *btn1;
    QPushButton *btn2;
    QPushButton *btn3;
    QPushButton *btn4;
    QPushButton *btn5;
    QPushButton *btn6;
};

#endif // TRAFFICANALYSISSYSTEM_H