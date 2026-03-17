#include "TrafficAnalysisSystem.h"

TrafficAnalysisSystem::TrafficAnalysisSystem(QWidget *parent)
    : QMainWindow(parent)
{
    setWindowTitle("交通分析系统");
    resize(400, 500);
    
    centralWidget = new QWidget(this);
    layout = new QVBoxLayout(centralWidget);
    
    btn1 = new QPushButton("查询轨迹", centralWidget);
    btn2 = new QPushButton("区域查找", centralWidget);
    btn3 = new QPushButton("车辆密度", centralWidget);
    btn4 = new QPushButton("区域关联分析", centralWidget);
    btn5 = new QPushButton("频繁路径分析", centralWidget);
    btn6 = new QPushButton("通行时间分析", centralWidget);
    
    layout->addWidget(btn1);
    layout->addWidget(btn2);
    layout->addWidget(btn3);
    layout->addWidget(btn4);
    layout->addWidget(btn5);
    layout->addWidget(btn6);
    
    layout->setSpacing(10);
    layout->setContentsMargins(20, 20, 20, 20);
    
    setCentralWidget(centralWidget);
}

TrafficAnalysisSystem::~TrafficAnalysisSystem()
{
    // 不需要手动删除子部件，Qt会自动处理
}