// Package config 管理 menote-pc 的本地持久化状态：配置项 + 节点身份密钥。
//
// 目录遵循各平台惯例（os.UserConfigDir）：
//
//	Windows  %AppData%\menote-pc
//	Linux    $XDG_CONFIG_HOME/menote-pc（默认 ~/.config/menote-pc）
//	macOS    ~/Library/Application Support/menote-pc
//
// 环境变量 MENOTE_CONFIG_DIR 可覆盖目录，便于多实例并存与测试隔离。
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/tmc/go-iroh/key"
)

const (
	dirName  = "menote-pc"
	fileName = "config.json"
	keyName  = "node-key.bin"

	// DefaultListen 默认只监听本机回环——代理不做鉴权，暴露到 0.0.0.0
	// 等于把 NAS 后台的登录页开给整个局域网。
	DefaultListen = "127.0.0.1"
	// DefaultPort 与安卓端 / MeNote 主服务保持一致的默认端口。
	DefaultPort = 3107
)

// Config 是 menote-pc 的持久化配置。
type Config struct {
	// ServerNodeID 服务端（跑着 MeNote 的那台机器）的节点 ID，base32 或 hex 均可。
	ServerNodeID string `json:"server_node_id"`
	// Listen 本地代理监听地址。
	Listen string `json:"listen"`
	// Port 本地代理端口；被占用时自动向上递增。
	Port int `json:"port"`
	// AutoOpenBrowser 启动后自动打开浏览器。
	AutoOpenBrowser bool `json:"auto_open_browser"`

	dir string // 配置目录（解析后）
}

// Dir 返回配置目录（不创建）。
func Dir() (string, error) {
	if d := strings.TrimSpace(os.Getenv("MENOTE_CONFIG_DIR")); d != "" {
		return d, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("无法定位系统配置目录：%w", err)
	}
	return filepath.Join(base, dirName), nil
}

// Path 返回配置文件绝对路径。
func Path() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, fileName), nil
}

// KeyPath 返回节点身份密钥文件绝对路径。
func KeyPath() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, keyName), nil
}

// Load 读取配置。文件不存在时返回带默认值的空配置（不算错误）。
func Load() (*Config, error) {
	dir, err := Dir()
	if err != nil {
		return nil, err
	}
	cfg := &Config{
		Listen:          DefaultListen,
		Port:            DefaultPort,
		AutoOpenBrowser: true,
		dir:             dir,
	}

	path := filepath.Join(dir, fileName)
	raw, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err := json.Unmarshal(raw, cfg); err != nil {
			return nil, fmt.Errorf("配置文件解析失败（%s）：%w", path, err)
		}
	case !errors.Is(err, os.ErrNotExist):
		return nil, fmt.Errorf("配置文件读取失败（%s）：%w", path, err)
	}

	cfg.normalize()
	cfg.applyEnv()
	return cfg, nil
}

// Save 写回配置（目录 0700 / 文件 0600）。
func (c *Config) Save() error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("创建配置目录失败（%s）：%w", dir, err)
	}
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return fmt.Errorf("配置写入失败（%s）：%w", path, err)
	}
	return nil
}

// DirPath 返回配置目录（已解析）。
func (c *Config) DirPath() string { return c.dir }

// normalize 补默认值，容忍手工编辑出的零值。
func (c *Config) normalize() {
	c.ServerNodeID = strings.TrimSpace(c.ServerNodeID)
	if strings.TrimSpace(c.Listen) == "" {
		c.Listen = DefaultListen
	}
	if c.Port <= 0 || c.Port > 65535 {
		c.Port = DefaultPort
	}
}

// applyEnv 让环境变量覆盖配置文件，方便临时切换目标而不改文件。
func (c *Config) applyEnv() {
	if v := strings.TrimSpace(os.Getenv("MENOTE_SERVER")); v != "" {
		c.ServerNodeID = v
	}
	if v := strings.TrimSpace(os.Getenv("MENOTE_LISTEN")); v != "" {
		c.Listen = v
	}
	if v := strings.TrimSpace(os.Getenv("MENOTE_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 65535 {
			c.Port = n
		}
	}
	if v := strings.TrimSpace(os.Getenv("MENOTE_OPEN_BROWSER")); v != "" {
		switch strings.ToLower(v) {
		case "0", "false", "no", "off":
			c.AutoOpenBrowser = false
		case "1", "true", "yes", "on":
			c.AutoOpenBrowser = true
		}
	}
}

// LoadOrCreateSecretKey 载入或生成节点身份密钥（32 字节 Ed25519 种子）。
//
// 密钥持久化后节点 ID 固定 —— 服务端后台授权一次即可长期有效。
// 文件损坏或长度不对时重新生成（节点 ID 会变，需要重新授权）。
func LoadOrCreateSecretKey() (key.SecretKey, bool, error) {
	path, err := KeyPath()
	if err != nil {
		return key.SecretKey{}, false, err
	}
	if raw, err := os.ReadFile(path); err == nil {
		if len(raw) == 32 {
			sk, err := key.SecretKeyFromSlice(raw)
			if err == nil {
				return sk, false, nil
			}
		}
		// 长度/内容不对：当作损坏，走重新生成
	} else if !errors.Is(err, os.ErrNotExist) {
		return key.SecretKey{}, false, fmt.Errorf("节点密钥读取失败（%s）：%w", path, err)
	}

	sk, err := key.GenerateSecretKey()
	if err != nil {
		return key.SecretKey{}, false, fmt.Errorf("生成节点密钥失败：%w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return key.SecretKey{}, false, fmt.Errorf("创建配置目录失败：%w", err)
	}
	b := sk.Bytes()
	if err := os.WriteFile(path, b[:], 0o600); err != nil {
		return key.SecretKey{}, false, fmt.Errorf("节点密钥写入失败（%s）：%w", path, err)
	}
	return sk, true, nil
}
