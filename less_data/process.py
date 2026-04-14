import os
import random
import shutil

# 原目录（已经处理好的数据）
source_folder = r"D:\Taxi-Analysis\processed_data"

# 目标目录
target_folder = r"D:\Taxi-Analysis\less_data"

# 抽取数量
SAMPLE_SIZE = 1000

os.makedirs(target_folder, exist_ok=True)

# 获取所有文件（只要 .txt）
all_files = [f for f in os.listdir(source_folder) if f.endswith(".txt")]

print(f"总文件数: {len(all_files)}")

# 防止文件不够
sample_size = min(SAMPLE_SIZE, len(all_files))

# 随机抽样
selected_files = random.sample(all_files, sample_size)

print(f"随机选取 {sample_size} 个文件")

# 复制
for filename in selected_files:
    src_path = os.path.join(source_folder, filename)
    dst_path = os.path.join(target_folder, filename)
    shutil.copy2(src_path, dst_path)

print("完成！less_data 已生成")