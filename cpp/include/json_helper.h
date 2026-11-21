#pragma once
#include <string>
#include <vector>
#include <map>
#include <variant>
#include <stdexcept>
#include <sstream>
#include <iomanip>
#include <cmath>
#include <algorithm>

// Forward declaration
class SimpleJSON;

using JSONValue = std::variant<
    std::monostate,       // null
    bool,                 // boolean
    double,               // number
    std::string,          // string
    std::vector<SimpleJSON>,   // array
    std::map<std::string, SimpleJSON>  // object
>;

class SimpleJSON {
public:
    JSONValue value;

    SimpleJSON() : value(std::monostate{}) {}
    SimpleJSON(std::nullptr_t) : value(std::monostate{}) {}
    SimpleJSON(bool b) : value(b) {}
    SimpleJSON(double d) : value(d) {}
    SimpleJSON(int i) : value((double)i) {}
    SimpleJSON(long long i) : value((double)i) {}
    SimpleJSON(const std::string& s) : value(s) {}
    SimpleJSON(const char* s) : value(std::string(s)) {}
    SimpleJSON(const std::vector<SimpleJSON>& arr) : value(arr) {}
    SimpleJSON(const std::map<std::string, SimpleJSON>& obj) : value(obj) {}

    bool isNull() const { return std::holds_alternative<std::monostate>(value); }
    bool isBool() const { return std::holds_alternative<bool>(value); }
    bool isNumber() const { return std::holds_alternative<double>(value); }
    bool isString() const { return std::holds_alternative<std::string>(value); }
    bool isArray() const { return std::holds_alternative<std::vector<SimpleJSON>>(value); }
    bool isObject() const { return std::holds_alternative<std::map<std::string, SimpleJSON>>(value); }

    bool getBool() const { return std::get<bool>(value); }
    double getDouble() const { return std::get<double>(value); }
    int getInt() const { return (int)std::get<double>(value); }
    const std::string& getString() const { return std::get<std::string>(value); }
    const std::vector<SimpleJSON>& getArray() const { return std::get<std::vector<SimpleJSON>>(value); }
    const std::map<std::string, SimpleJSON>& getObject() const { return std::get<std::map<std::string, SimpleJSON>>(value); }

    bool has(const std::string& key) const {
        if (!isObject()) return false;
        return getObject().count(key) > 0;
    }

    const SimpleJSON& operator[](const std::string& key) const {
        return getObject().at(key);
    }
    SimpleJSON& operator[](const std::string& key) {
        if (!isObject()) value = std::map<std::string, SimpleJSON>{};
        return std::get<std::map<std::string, SimpleJSON>>(value)[key];
    }

    template<typename T>
    T getValue(const std::string& key) const;

    std::vector<SimpleJSON> getArray(const std::string& key) const {
        if (!has(key)) return {};
        const auto& v = (*this)[key];
        if (v.isArray()) return v.getArray();
        return {};
    }

    SimpleJSON getObject(const std::string& key) const {
        if (!has(key)) return SimpleJSON{};
        return (*this)[key];
    }

    // Serialize to JSON string
    std::string serialize() const {
        std::ostringstream oss;
        serialize_to(oss);
        return oss.str();
    }

private:
    void serialize_to(std::ostringstream& oss) const {
        if (isNull()) {
            oss << "null";
        } else if (isBool()) {
            oss << (getBool() ? "true" : "false");
        } else if (isNumber()) {
            double d = getDouble();
            if (std::isnan(d) || std::isinf(d)) {
                oss << "0";
            } else if (d == (long long)d && std::abs(d) < 1e15) {
                oss << (long long)d;
            } else {
                oss << std::setprecision(10) << d;
            }
        } else if (isString()) {
            oss << '"';
            for (char c : getString()) {
                if (c == '"') oss << "\\\"";
                else if (c == '\\') oss << "\\\\";
                else if (c == '\n') oss << "\\n";
                else if (c == '\r') oss << "\\r";
                else if (c == '\t') oss << "\\t";
                else oss << c;
            }
            oss << '"';
        } else if (isArray()) {
            oss << '[';
            const auto& arr = getArray();
            for (size_t i = 0; i < arr.size(); i++) {
                if (i > 0) oss << ',';
                arr[i].serialize_to(oss);
            }
            oss << ']';
        } else if (isObject()) {
            oss << '{';
            bool first = true;
            for (const auto& [k, v] : getObject()) {
                if (!first) oss << ',';
                first = false;
                oss << '"';
                for (char c : k) {
                    if (c == '"') oss << "\\\"";
                    else oss << c;
                }
                oss << "\":";
                v.serialize_to(oss);
            }
            oss << '}';
        }
    }

public:
    // ---- Parser ----
    static SimpleJSON parse(const std::string& s) {
        size_t pos = 0;
        return parse_value(s, pos);
    }

private:
    static void skip_ws(const std::string& s, size_t& pos) {
        while (pos < s.size() && (s[pos] == ' ' || s[pos] == '\t' || s[pos] == '\r' || s[pos] == '\n'))
            pos++;
    }

    static SimpleJSON parse_value(const std::string& s, size_t& pos) {
        skip_ws(s, pos);
        if (pos >= s.size()) throw std::runtime_error("Unexpected end of input");
        char c = s[pos];
        if (c == '{') return parse_object(s, pos);
        if (c == '[') return parse_array(s, pos);
        if (c == '"') return parse_string(s, pos);
        if (c == 't') { // true
            if (s.substr(pos, 4) == "true") { pos += 4; return SimpleJSON(true); }
        }
        if (c == 'f') { // false
            if (s.substr(pos, 5) == "false") { pos += 5; return SimpleJSON(false); }
        }
        if (c == 'n') { // null
            if (s.substr(pos, 4) == "null") { pos += 4; return SimpleJSON(); }
        }
        // number
        return parse_number(s, pos);
    }

    static SimpleJSON parse_object(const std::string& s, size_t& pos) {
        pos++; // consume '{'
        std::map<std::string, SimpleJSON> obj;
        skip_ws(s, pos);
        if (pos < s.size() && s[pos] == '}') { pos++; return SimpleJSON(obj); }
        while (pos < s.size()) {
            skip_ws(s, pos);
            if (s[pos] != '"') throw std::runtime_error("Expected string key");
            std::string key = parse_string(s, pos).getString();
            skip_ws(s, pos);
            if (pos >= s.size() || s[pos] != ':') throw std::runtime_error("Expected ':'");
            pos++;
            SimpleJSON val = parse_value(s, pos);
            obj[key] = val;
            skip_ws(s, pos);
            if (pos >= s.size()) break;
            if (s[pos] == '}') { pos++; break; }
            if (s[pos] == ',') { pos++; continue; }
            throw std::runtime_error("Expected ',' or '}'");
        }
        return SimpleJSON(obj);
    }

    static SimpleJSON parse_array(const std::string& s, size_t& pos) {
        pos++; // consume '['
        std::vector<SimpleJSON> arr;
        skip_ws(s, pos);
        if (pos < s.size() && s[pos] == ']') { pos++; return SimpleJSON(arr); }
        while (pos < s.size()) {
            arr.push_back(parse_value(s, pos));
            skip_ws(s, pos);
            if (pos >= s.size()) break;
            if (s[pos] == ']') { pos++; break; }
            if (s[pos] == ',') { pos++; continue; }
            throw std::runtime_error("Expected ',' or ']'");
        }
        return SimpleJSON(arr);
    }

    static SimpleJSON parse_string(const std::string& s, size_t& pos) {
        pos++; // consume '"'
        std::string result;
        while (pos < s.size()) {
            char c = s[pos++];
            if (c == '"') break;
            if (c == '\\') {
                if (pos >= s.size()) break;
                char e = s[pos++];
                if (e == '"') result += '"';
                else if (e == '\\') result += '\\';
                else if (e == '/') result += '/';
                else if (e == 'n') result += '\n';
                else if (e == 'r') result += '\r';
                else if (e == 't') result += '\t';
                else if (e == 'b') result += '\b';
                else if (e == 'f') result += '\f';
                else if (e == 'u') {
                    // skip 4 hex chars
                    std::string hex = s.substr(pos, 4);
                    pos += 4;
                    int code = std::stoi(hex, nullptr, 16);
                    if (code < 128) result += (char)code;
                    else result += '?';
                }
                else result += e;
            } else {
                result += c;
            }
        }
        return SimpleJSON(result);
    }

    static SimpleJSON parse_number(const std::string& s, size_t& pos) {
        size_t start = pos;
        if (pos < s.size() && s[pos] == '-') pos++;
        while (pos < s.size() && std::isdigit(s[pos])) pos++;
        if (pos < s.size() && s[pos] == '.') {
            pos++;
            while (pos < s.size() && std::isdigit(s[pos])) pos++;
        }
        if (pos < s.size() && (s[pos] == 'e' || s[pos] == 'E')) {
            pos++;
            if (pos < s.size() && (s[pos] == '+' || s[pos] == '-')) pos++;
            while (pos < s.size() && std::isdigit(s[pos])) pos++;
        }
        std::string num_str = s.substr(start, pos - start);
        return SimpleJSON(std::stod(num_str));
    }
};

// Template specializations
template<> inline std::string SimpleJSON::getValue<std::string>(const std::string& key) const {
    if (!has(key)) return "";
    const auto& v = (*this)[key];
    if (v.isString()) return v.getString();
    if (v.isNumber()) {
        double d = v.getDouble();
        if (d == (long long)d) return std::to_string((long long)d);
        return std::to_string(d);
    }
    return "";
}

template<> inline double SimpleJSON::getValue<double>(const std::string& key) const {
    if (!has(key)) return 0.0;
    const auto& v = (*this)[key];
    if (v.isNumber()) return v.getDouble();
    if (v.isString()) {
        try { return std::stod(v.getString()); } catch(...) { return 0.0; }
    }
    return 0.0;
}

template<> inline int SimpleJSON::getValue<int>(const std::string& key) const {
    return (int)getValue<double>(key);
}

template<> inline bool SimpleJSON::getValue<bool>(const std::string& key) const {
    if (!has(key)) return false;
    const auto& v = (*this)[key];
    if (v.isBool()) return v.getBool();
    if (v.isNumber()) return v.getDouble() != 0.0;
    return false;
}

// Builder helpers
inline SimpleJSON makeObject() {
    return SimpleJSON(std::map<std::string, SimpleJSON>{});
}
inline SimpleJSON makeArray() {
    return SimpleJSON(std::vector<SimpleJSON>{});
}
