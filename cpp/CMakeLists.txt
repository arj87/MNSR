cmake_minimum_required(VERSION 3.10)
project(mnsr_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

set(SOURCES
    src/main.cpp
    src/graph.cpp
    src/netting.cpp
    src/settlement.cpp
    src/liquidity.cpp
    src/contagion.cpp
    src/regulator.cpp
)

add_executable(mnsr_engine ${SOURCES})
