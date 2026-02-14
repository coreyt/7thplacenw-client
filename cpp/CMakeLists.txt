cmake_minimum_required(VERSION 3.20)
project(seventhplace VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Dependencies
include(FetchContent)

FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)

FetchContent_Declare(
    yaml-cpp
    GIT_REPOSITORY https://github.com/jbeder/yaml-cpp.git
    GIT_TAG        0.8.0
)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.6.0
)

FetchContent_MakeAvailable(nlohmann_json yaml-cpp Catch2)

# Library
add_library(seventhplace
    src/config.cpp
    src/merge.cpp
    src/providers.cpp
    src/sensitive.cpp
)

target_include_directories(seventhplace
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(seventhplace
    PUBLIC nlohmann_json::nlohmann_json
    PRIVATE yaml-cpp::yaml-cpp
)

# Tests
enable_testing()

add_executable(seventhplace_tests
    tests/compliance_test.cpp
    tests/merge_test.cpp
    tests/providers_test.cpp
)

target_link_libraries(seventhplace_tests
    PRIVATE seventhplace Catch2::Catch2WithMain
)

include(Catch)
catch_discover_tests(seventhplace_tests)

# Install
install(TARGETS seventhplace EXPORT seventhplaceTargets)
install(DIRECTORY include/ DESTINATION include)
install(EXPORT seventhplaceTargets
    FILE seventhplaceConfig.cmake
    NAMESPACE seventhplace::
    DESTINATION lib/cmake/seventhplace
)
